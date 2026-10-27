from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=False
    )

    specialization = Column(
        String(100),
        nullable=False
    )

    qualification = Column(
        String(200),
        nullable=True
    )

    experience_years = Column(
        Integer,
        default=0
    )

    license_number = Column(
        String(100),
        unique=True,
        nullable=True
    )

    consultation_fee = Column(
        Float,
        default=0.0
    )

    user = relationship(
        "User",
        backref="doctor_profile"
    )