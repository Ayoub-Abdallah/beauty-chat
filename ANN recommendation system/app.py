from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from models.recommender import Recommender
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
import json

app = FastAPI()
recommender = Recommender('data/products.json')

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

class RecommendRequest(BaseModel):
    conversation: list

class BoostRequest(BaseModel):
    product_id: int
    boost: float

@app.post('/recommend')
def recommend(req: RecommendRequest):
    session_text = ' '.join(req.conversation)
    # Simple category extraction
    category = None
    for msg in req.conversation:
        for cat in set([p['category'] for p in recommender.products]):
            if cat.lower() in msg.lower():
                category = cat
                break
    results = recommender.recommend(session_text, category)
    return {"recommendations": results}

@app.post('/seller/boost')
def seller_boost(req: BoostRequest):
    recommender.update_seller_boost(req.product_id, req.boost)
    return {"status": "success"}

@app.get('/products')
def get_products():
    return recommender.get_products()

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/sample_conversations")
def sample_conversations():
    with open('data/conversations.json', 'r') as f:
        return json.load(f)
