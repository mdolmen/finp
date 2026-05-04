import pytest

from finp.db import connect, migrate


@pytest.fixture
def conn():
    c = connect(":memory:")
    migrate(c)
    yield c
    c.close()
