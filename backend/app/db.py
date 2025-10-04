import os
import psycopg
from contextlib import contextmanager
from typing import Iterator


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL must be set")
    # psycopg expects sslmode in URL for many managed services; respect existing URL
    return url


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(get_database_url(), autocommit=True)
    try:
        yield conn
    finally:
        conn.close()


def dict_row_factory(cursor, row):
    return {desc.name: value for desc, value in zip(cursor.description, row)}


def fetchone_dict(cur) -> dict | None:
    row = cur.fetchone()
    if row is None:
        return None
    columns = [desc.name for desc in cur.description]
    return dict(zip(columns, row))


def fetchall_dicts(cur) -> list[dict]:
    rows = cur.fetchall()
    if not rows:
        return []
    columns = [desc.name for desc in cur.description]
    return [dict(zip(columns, r)) for r in rows]

