from . import models
from .database import Base, engine


def init_db():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("已创建数据表：trips, blocks")
