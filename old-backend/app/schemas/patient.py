from datetime import date

from pydantic import BaseModel


class PatientProfileCreate(BaseModel):
    date_of_birth: date | None = None
    gender: str | None = None
    phone: str | None = None
    address: str | None = None
    blood_group: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None


class PatientProfileResponse(BaseModel):
    id: int
    user_id: int
    date_of_birth: date | None
    gender: str | None
    phone: str | None
    address: str | None
    blood_group: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None

    class Config:
        from_attributes = True