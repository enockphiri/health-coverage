# backend/db.py
import psycopg2
from config import DB_CONFIG


def get_connection():
    """Open a new connection to the Post
    GIS database."""
    return psycopg2.connect(**DB_CONFIG)