from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import orders, recompute, search, trips

app = FastAPI(title="Travel Rescuer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trips.router)
app.include_router(recompute.router)
app.include_router(search.router)
app.include_router(orders.router)


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
