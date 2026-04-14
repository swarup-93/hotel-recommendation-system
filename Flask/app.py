from flask import Flask, request, jsonify, render_template
import pickle
import pandas as pd
import os

app = Flask(__name__)

# ── Load the pickle ────────────────────────────────────────────────────────────
MODEL_PATH = os.environ.get("MODEL_PATH", "model/zomato_recommender.pkl")

model               = None
tfidf               = None
tfidf_matrix        = None
cosine_similarities = None
indices             = None   # pd.Series  positional-int → restaurant name
df_percent          = None   # DataFrame indexed by restaurant name

try:
    with open(MODEL_PATH, "rb") as f:
        raw = pickle.load(f)

    tfidf               = raw["tfidf"]
    tfidf_matrix        = raw["tfidf_matrix"]
    cosine_similarities = raw["cosine_similarities"]
    indices             = raw["indices"]   # pd.Series(df_percent.index)
    stored_data         = raw["data"]      # could be zomato_real OR df_percent

    # ── Detect and normalise df_percent ───────────────────────────────────────
    # The notebook did:
    #   df_percent = zomato.sample(frac=0.5)
    #   df_percent.set_index('name', inplace=True)
    #   indices = pd.Series(df_percent.index)
    # So indices.values == df_percent.index (restaurant names)

    if stored_data.index.name == "name" or (
        stored_data.index.dtype == object and
        stored_data.index[0] in indices.values
    ):
        # Already name-indexed df_percent
        df_percent = stored_data
        print("✅ data is already name-indexed df_percent")
    elif "name" in stored_data.columns:
        df_percent = stored_data.set_index("name")
        print("✅ Set 'name' column as index")
    else:
        df_percent = stored_data
        print("⚠️  Using stored_data as-is")

    # Normalise cost column name
    if "approx_cost(for two people)" in df_percent.columns and "cost" not in df_percent.columns:
        df_percent = df_percent.rename(columns={"approx_cost(for two people)": "cost"})

    model = raw
    print(f"✅ Model loaded. {len(indices)} entries in indices.")
    print(f"   df_percent shape : {df_percent.shape}")
    print(f"   df_percent cols  : {list(df_percent.columns)}")
    print(f"   index sample     : {list(df_percent.index[:5])}")

except FileNotFoundError:
    print(f"⚠️  '{MODEL_PATH}' not found – running in demo mode.")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    import traceback; traceback.print_exc()


# ── Parsers ────────────────────────────────────────────────────────────────────
def parse_rating(val):
    try:
        s = str(val).strip()
        if s in ("nan", "None", "", "NEW", "-"):
            return 0.0
        if "/" in s:
            s = s.split("/")[0].strip()
        return round(float(s), 2)
    except (ValueError, TypeError):
        return 0.0

def parse_cost(val):
    try:
        s = str(val).strip().replace(",", "")
        if s in ("nan", "None", ""):
            return 0
        return int(float(s))
    except (ValueError, TypeError):
        return 0

def get_col(row, *names):
    for n in names:
        if n in row.index:
            v = row[n]
            if pd.notna(v):
                return v
    return None


# ── Recommend ──────────────────────────────────────────────────────────────────
def recommend(name):
    if model is None:
        return [
            {"name": "Sample Restaurant A", "cuisines": "North Indian, Chinese", "rating": 4.2, "cost": 400},
            {"name": "Sample Restaurant B", "cuisines": "South Indian",          "rating": 4.0, "cost": 300},
            {"name": "Sample Restaurant C", "cuisines": "Fast Food, Burgers",    "rating": 3.8, "cost": 250},
        ]

    matches = indices[indices == name]
    if matches.empty:
        return []

    matrix_row   = matches.index[0]
    score_series = pd.Series(cosine_similarities[matrix_row]).sort_values(ascending=False)
    top30        = list(score_series.iloc[1:31].index)

    seen, results = set(), []
    for pos in top30:
        if pos >= len(indices):
            continue
        rest_name = indices.iloc[pos]
        if rest_name in seen or rest_name == name:
            continue
        seen.add(rest_name)

        rows = df_percent[df_percent.index == rest_name]
        if rows.empty:
            continue
        row = rows.iloc[0]

        results.append({
            "name":     rest_name,
            "cuisines": str(get_col(row, "cuisines", "cuisine") or "N/A"),
            "rating":   parse_rating(get_col(row, "Mean Rating", "rate", "rating")),
            "cost":     parse_cost(get_col(row, "cost", "approx_cost(for two people)")),
        })
        if len(results) == 10:
            break

    results.sort(key=lambda x: x["rating"], reverse=True)
    return results


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/restaurants")
def list_restaurants():
    if model is None:
        return jsonify({"restaurants": ["Pai Vihar", "Meghana Foods", "Truffles"]})
    return jsonify({"restaurants": sorted(set(indices.tolist()))})

@app.route("/api/recommend", methods=["POST"])
def get_recommendations():
    data = request.get_json()
    name = (data or {}).get("name", "").strip()
    if not name:
        return jsonify({"error": "Please provide a restaurant name."}), 400
    results = recommend(name)
    if not results and model is not None:
        return jsonify({"error": f"'{name}' not found. Select from the autocomplete."}), 404
    return jsonify({"query": name, "results": results})

@app.route("/api/debug")
def debug():
    if model is None:
        return jsonify({"status": "demo mode"})
    return jsonify({
        "status":          "loaded",
        "indices_len":     int(len(indices)),
        "indices_sample":  indices.head(10).tolist(),
        "df_shape":        list(df_percent.shape),
        "df_columns":      list(df_percent.columns),
        "df_index_sample": list(df_percent.index[:10]),
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)