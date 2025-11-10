import numpy as np

def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

def normalize(x, min_val=0, max_val=1):
    return max(min((x - min_val) / (max_val - min_val), 1.0), 0.0)

def compute_score(sim, cat, pop, stock, recency, personal, seller_boost, max_boost=0.25):
    w_sim = 0.6
    w_cat = 0.15
    w_pop = 0.1
    w_stock = 0.05
    w_recency = 0.05
    w_personal = 0.05
    base = w_sim*sim + w_cat*cat + w_pop*pop + w_stock*stock + w_recency*recency + w_personal*personal
    final_score = base * (1 + min(max(seller_boost, 0), max_boost))
    return final_score
