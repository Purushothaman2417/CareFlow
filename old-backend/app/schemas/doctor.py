from pydantic import BaseModel


class DoctorProfileCreate(BaseModel):
    specialization: str
    qualification: str | None = None
    experience_years: int = 0
    license_number: str | None = None
    consultation_fee: float = 0.0


class DoctorProfileResponse(BaseModel):
    id: int
    user_id: int
    specialization: str
    qualification: str | None
    experience_years: int
    license_number: str | None
    consultation_fee: float

    class Config:
        from_attributes = True