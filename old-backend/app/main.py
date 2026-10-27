from fastapi import FastAPI
from app.api.patients import router as patient_router
from app.api.doctors import router as doctor_router

from app.database import Base, engine
from app.redis_client import redis_client
from app.models.user import User
from app.models.patient import Patient
from app.models.doctor import Doctor
from app.api.auth import router as auth_router
from app.models.appointment import Appointment
from app.api.appointments import router as appointment_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CareFlow API",
    version="1.0.0"
)

app.include_router(auth_router)
app.include_router(patient_router)
app.include_router(doctor_router)
app.include_router(appointment_router)


@app.get("/")
def root():
    return {
        "message": "CareFlow API is running"
    }


@app.get("/health")
def health():
    redis_status = redis_client.ping()

    return {
        "status": "healthy",
        "postgresql": "connected",
        "redis": "connected" if redis_status else "disconnected"
    }