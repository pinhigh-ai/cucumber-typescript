@mocked @orders
Feature: Order creation

  Reference feature showing the conventions: technical step wording, one When per
  scenario, typed table data, an outline for data variation, structural JSON
  assertions with matcher tokens, and verification of the outbound downstream call.

  Background:
    Given the following records exist in table "products"
      | sku      | name        | stock | active |
      | SKU-1001 | Blue widget | 5     | true   |
    And the "orders-api" client sets the header "authorization" to "Bearer {{env:TEST_TOKEN}}"

  Scenario: A valid order is created and charged
    Given the "payments" service responds to POST "/charges" with status 201 and the following JSON body:
      """
      { "id": "ch_abc123", "status": "succeeded" }
      """
    When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
      """
      { "sku": "SKU-1001", "quantity": 2 }
      """
    Then the response status is 201
    And the created "/v1/orders" at the JSON path "id" is removed after the scenario
    And the response body matches the following JSON:
      """
      {
        "id": "{{uuid}}",
        "sku": "SKU-1001",
        "quantity": 2,
        "total": 2500,
        "paymentId": "ch_abc123",
        "createdAt": "{{iso8601}}"
      }
      """
    And the "payments" service received 1 request to POST "/charges"
    And the last request to the "payments" service had the following JSON body:
      """
      { "amount": 2500, "currency": "USD", "idempotencyKey": "{{string}}" }
      """

  Scenario: Existing orders are returned for a customer
    Given a scenario-unique "customer" is stored as "customerId"
    And the following records exist in table "orders"
      | orderId | orderType | orderAmount | orderTimestamp            | customerId         |
      | 1001    | AA        | $302.23     | 2026-07-31T12:00:01.0000Z | {{ctx:customerId}} |
      | 1002    | BB        | $24.54      | 2026-07-31T14:05:02.0000Z | {{ctx:customerId}} |
    When the "orders-api" client sends a GET request to "/v1/orders?customerId={{ctx:customerId}}"
    Then the response status is 200
    And the JSON path "orders" in the response has 2 items
    And the response body contains the following JSON:
      """
      {
        "orders": [
          { "orderId": 1001, "orderType": "AA", "orderAmount": 30223 },
          { "orderId": 1002, "orderType": "BB", "orderAmount": 2454 }
        ]
      }
      """

  Scenario Outline: Invalid quantities are rejected before any charge is attempted
    When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
      """
      { "sku": "SKU-1001", "quantity": <quantity> }
      """
    Then the response status is <status>
    And the response body contains the following JSON:
      """
      { "error": { "code": "<errorCode>" } }
      """
    And the "payments" service received 0 requests to POST "/charges"

    Examples: rejected quantities
      | quantity | status | errorCode          |
      | 0        | 400    | QUANTITY_TOO_LOW   |
      | -1       | 400    | QUANTITY_TOO_LOW   |
      | 9999     | 409    | INSUFFICIENT_STOCK |

  Scenario: A payment failure does not leave an order behind
    Given the "payments" service responds to POST "/charges" with status 502 and the following JSON body:
      """
      { "error": "upstream_unavailable" }
      """
    When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
      """
      { "sku": "SKU-1001", "quantity": 1 }
      """
    Then the response status is 502
    And the response body contains the following JSON:
      """
      { "error": { "code": "PAYMENT_UNAVAILABLE" } }
      """

  Scenario: A created order can be read back by id
    Given the "payments" service responds to POST "/charges" with status 201 and the following JSON body:
      """
      { "id": "ch_def456", "status": "succeeded" }
      """
    When the "orders-api" client sends a POST request to "/v1/orders" with the following JSON body:
      """
      { "sku": "SKU-1001", "quantity": 1 }
      """
    Then the response status is 201
    And the created "/v1/orders" at the JSON path "id" is removed after the scenario
    And the JSON path "id" in the response is stored as "orderId"
    When the "orders-api" client sends a GET request to "/v1/orders/{{ctx:orderId}}"
    Then the response status is 200
    And the JSON path "sku" in the response equals "SKU-1001"
