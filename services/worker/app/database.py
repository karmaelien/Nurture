import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, sessionmaker, Session

load_dotenv()

DATABASE_URL= os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

Session = sessionmaker(bind=engine)

def get_db() -> Session:
    db = Session()
    try:
        yield db
    finally:
        db.close()