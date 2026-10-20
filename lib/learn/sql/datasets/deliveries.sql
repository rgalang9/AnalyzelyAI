CREATE TABLE deliveries (
  order_id INTEGER PRIMARY KEY,
  customer TEXT,
  restaurant TEXT,
  order_date TEXT,
  total REAL,
  tip REAL,
  minutes INTEGER
);

INSERT INTO deliveries VALUES
(1, 'Ava', 'Pizza Palace', '2026-01-05', 24.50, 4.00, 32),
(2, 'Ben', 'Taco Town', '2026-01-12', 15.00, NULL, 18),
(3, 'Chloe', 'Sushi Spot', '2026-02-03', 42.00, 8.00, 45),
(4, 'Diego', 'Pizza Palace', '2026-02-14', 31.00, 5.00, 50),
(5, 'Emma', 'Burger Barn', '2026-02-20', 12.00, NULL, 22),
(6, 'Finn', 'Sushi Spot', '2026-03-01', 55.00, 10.00, 38),
(7, 'Grace', 'Taco Town', '2026-03-09', 18.00, 3.00, 27),
(8, 'Hiro', 'Burger Barn', '2026-03-15', 20.00, 2.00, 61),
(9, 'Isla', 'Pizza Palace', '2026-03-28', 27.00, NULL, 35),
(10, 'Jay', 'Taco Town', '2026-04-02', 9.50, 1.50, 15);