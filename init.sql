CREATE TABLE host (name TEXT, addr4 TEXT, addr6 TEXT);
CREATE TABLE user (name TEXT, token TEXT, config JSON);
CREATE TABLE access (user TEXT, type TEXT, tag TEXT);
CREATE TABLE proxy (type TEXT, config JSON, tag TEXT);
CREATE TABLE route (type TEXT, config JSON, tag TEXT);