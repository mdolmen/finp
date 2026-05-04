from finp.events import EventBus


def test_publish_with_no_subscribers_is_noop():
    bus = EventBus()
    bus.publish("operation.created", {"id": 1})


def test_subscribers_receive_payload():
    bus = EventBus()
    received = []
    bus.subscribe("operation.created", received.append)
    bus.publish("operation.created", {"id": 1})
    bus.publish("operation.updated", {"id": 2})
    assert received == [{"id": 1}]


def test_unsubscribe_stops_delivery():
    bus = EventBus()
    received = []
    off = bus.subscribe("rule.matched", received.append)
    bus.publish("rule.matched", {"rule_id": 1})
    off()
    bus.publish("rule.matched", {"rule_id": 2})
    assert received == [{"rule_id": 1}]


def test_handler_exception_does_not_break_other_subscribers():
    bus = EventBus()
    received = []

    def boom(_p):
        raise RuntimeError("nope")

    bus.subscribe("operation.created", boom)
    bus.subscribe("operation.created", received.append)

    bus.publish("operation.created", {"id": 42})
    assert received == [{"id": 42}]
