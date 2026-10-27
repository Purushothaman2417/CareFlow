from sqlalchemy import Column, Integer, String, Date, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=False
    )

    date_of_birth = Column(Date, nullable=True)

    gender = Column(
        String(20),
        nullable=True
    )

    phone = Column(
        String(20),
        nullable=True
    )

    address = Column(
        String(500),
        nullable=True
    )

    blood_group = Column(
        String(10),
        nullable=True
    )

    emergency_contact_name = Column(
        String(100),
        nullable=True
    )

    emergency_contact_phone = Column(
        String(20),
        nullable=True
    )

    user = relationship(
        "User",
        backref="patient_profile"
    )