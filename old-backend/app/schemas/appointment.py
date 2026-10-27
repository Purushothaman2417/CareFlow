from datetime import datetime

from pydantic import BaseModel


class AppointmentCreate(BaseModel):
    doctor_id: int
    appointment_date: datetime
    reason: str | None = None


class AppointmentResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    appointment_date: datetime
    reason: str | None
    status: str

    class Config:
        from_attributes = True