import json

from app.redis_client import redis_client


def set_user_cache(user_id: int, user_data: dict, expire: int = 3600):
    key = f"user:{user_id}"

    redis_client.setex(
        key,
        expire,
        json.dumps(user_data)
    )


def get_user_cache(user_id: int):
    key = f"user:{user_id}"

    data = redis_client.get(key)

    if data is None:
        return None

    return json.loads(data)


def delete_user_cache(user_id: int):
    key = f"user:{user_id}"

    redis_client.delete(key)