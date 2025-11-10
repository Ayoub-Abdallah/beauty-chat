import json
import numpy as np
from utils.embeddings import get_embedding, get_embeddings
from utils.scoring import cosine_similarity, compute_score, normalize

class Recommender:
    def __init__(self, products_path):
        with open(products_path, 'r') as f:
            self.products = json.load(f)
        self.product_texts = [p['title'] + ' ' + p['description'] for p in self.products]
        self.product_embeddings = get_embeddings(self.product_texts)

    def recommend(self, session_text, category=None, top_k=5):
        session_emb = get_embedding(session_text)
        candidates = []
        for idx, product in enumerate(self.products):
            if product['stock'] <= 0:
                continue
            if category and product['category'].lower() != category.lower():
                continue
            sim = normalize(cosine_similarity(session_emb, self.product_embeddings[idx]))
            cat_match = 1.0 if category and product['category'].lower() == category.lower() else 0.5
            pop = normalize(product['popularity'])
            stock = normalize(product['stock'])
            recency = normalize(product['recency'])
            personal = normalize(product['personal'])
            seller_boost = product.get('seller_boost', 0.0)
            score = compute_score(sim, cat_match, pop, stock, recency, personal, seller_boost)
            candidates.append({
                'id': product['id'],
                'title': product['title'],
                'category': product['category'],
                'score': float(round(score, 2)),  # Ensure score is a native float
                'reason': self._reason(session_text, product)
            })
        candidates.sort(key=lambda x: x['score'], reverse=True)
        return candidates[:top_k]

    def _reason(self, session_text, product):
        if 'running' in session_text.lower() and 'shoes' in product['title'].lower():
            return "Matches your request for running shoes."
        if 'lightweight' in session_text.lower() and 'lightweight' in product['description'].lower():
            return "Recommended for lightweight preference."
        if 'yoga' in session_text.lower() and 'yoga' in product['title'].lower():
            return "Recommended for yoga practice."
        return f"Relevant to your interest in {product['category'].lower()} products."

    def update_seller_boost(self, product_id, boost):
        for product in self.products:
            if product['id'] == product_id:
                product['seller_boost'] = boost
        with open('data/products.json', 'w') as f:
            json.dump(self.products, f, indent=2)

    def get_products(self):
        return self.products
