CREATE TABLE games (
  game_id INTEGER PRIMARY KEY,
  title TEXT,
  genre TEXT,
  release_year INTEGER,
  rating REAL,
  price REAL,
  studio_id INTEGER
);

INSERT INTO games VALUES
(1, 'Minecraft', 'Sandbox', 2011, 9.0, 29.99, 2),
(2, 'Fortnite', 'Shooter', 2017, 8.0, 0.00, 3),
(3, 'Super Mario Odyssey', 'Platformer', 2017, 9.7, 59.99, 1),
(4, 'Mario Kart 8 Deluxe', 'Racing', 2017, 9.2, 59.99, 1),
(5, 'Zelda: Breath of the Wild', 'Adventure', 2017, 9.7, 59.99, 1),
(6, 'Grand Theft Auto V', 'Action', 2013, 9.6, 29.99, 4),
(7, 'Red Dead Redemption 2', 'Action', 2018, 9.7, 59.99, 4),
(8, 'Elden Ring', 'RPG', 2022, 9.6, 59.99, 6),
(9, 'The Witcher 3', 'RPG', 2015, 9.3, 39.99, 7),
(10, 'Stardew Valley', 'Simulation', 2016, 8.9, 14.99, 9),
(11, 'Among Us', 'Party', 2018, 8.5, 4.99, 10),
(12, 'League of Legends', 'Strategy', 2009, 7.8, 0.00, 8),
(13, 'EA Sports FC 24', 'Sports', 2023, NULL, 69.99, 5),
(14, 'Animal Crossing: New Horizons', 'Simulation', 2020, 9.0, 59.99, 1),
(15, 'Valorant', 'Shooter', 2020, NULL, 0.00, 8);