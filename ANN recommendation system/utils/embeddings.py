from sentence_transformers import SentenceTransformer
import numpy as np

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
model = SentenceTransformer(MODEL_NAME)

def get_embedding(text: str) -> np.ndarray:
    return model.encode([text])[0]

def get_embeddings(texts: list) -> np.ndarray:
    return model.encode(texts)
