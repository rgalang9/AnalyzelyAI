CREATE TABLE sneakers (
  shoe_id INTEGER PRIMARY KEY,
  name TEXT,
  brand TEXT,
  category TEXT,
  release_year INTEGER,
  price REAL,
  stock INTEGER
);

INSERT INTO sneakers VALUES
(1, 'Air Force 1', 'Nike', 'Lifestyle', 1982, 115, 40),
(2, 'Air Jordan 1 High', 'Jordan', 'Basketball', 1985, 180, 12),
(3, 'Stan Smith', 'Adidas', 'Lifestyle', 1965, 100, 35),
(4, 'Ultraboost 1.0', 'Adidas', 'Running', 2015, 190, 8),
(5, 'Chuck Taylor All Star', 'Converse', 'Lifestyle', 1917, 65, 50),
(6, 'Old Skool', 'Vans', 'Skate', 1977, 70, 45),
(7, 'Air Max 90', 'Nike', 'Running', 1990, 140, 20),
(8, 'Gel-Kayano 14', 'ASICS', 'Running', 2008, 150, 15),
(9, 'Samba OG', 'Adidas', 'Lifestyle', 1950, 100, 30),
(10, '550', 'New Balance', 'Basketball', 1989, 120, 18),
(11, 'Dunk Low', 'Nike', 'Lifestyle', 1985, 115, 25),
(12, 'Pegasus 41', 'Nike', 'Running', 2024, 140, 22);