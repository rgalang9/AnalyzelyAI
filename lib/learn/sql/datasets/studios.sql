CREATE TABLE studios (
  studio_id INTEGER PRIMARY KEY,
  studio_name TEXT,
  country TEXT,
  founded_year INTEGER
);

INSERT INTO studios VALUES
(1, 'Nintendo', 'Japan', 1889),
(2, 'Mojang', 'Sweden', 2009),
(3, 'Epic Games', 'USA', 1991),
(4, 'Rockstar Games', 'USA', 1998),
(5, 'EA Sports', 'USA', 1991),
(6, 'FromSoftware', 'Japan', 1986),
(7, 'CD Projekt Red', 'Poland', 2002),
(8, 'Riot Games', 'USA', 2006),
(9, 'ConcernedApe', 'USA', 2012),
(10, 'Innersloth', 'USA', 2015),
(11, 'Valve', 'USA', 1996),
(12, 'Ubisoft', 'France', 1986);