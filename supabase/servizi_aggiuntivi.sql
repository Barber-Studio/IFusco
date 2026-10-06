-- Solo se hai GIA' eseguito schema.sql con i 4 servizi iniziali: aggiunge gli altri e rinomina il primo.
-- Se parti da zero NON serve: schema.sql contiene gia' tutti i servizi.
update services set name = 'Taglio capelli', sort = 1 where name = 'Taglio uomo';
update services set sort = 3 where name = 'Barba';
update services set sort = 4 where name = 'Taglio + barba';
update services set sort = 6 where name = 'Taglio ragazzo';
insert into services (name, description, price, duration_min, sort) values
 ('Sfumatura', 'Sfumatura alta, media o bassa, curata nei dettagli.', 20, 30, 2),
 ('Rasatura classica', 'Rasatura a rasoio con panno caldo e olio pre-barba.', 18, 30, 5),
 ('Shampoo e styling', 'Lavaggio, massaggio e messa in piega.', 10, 30, 7),
 ('Colore', 'Copertura dei capelli bianchi o colore, consulenza inclusa.', 25, 60, 8),
 ('Pulizia viso', 'Detersione, scrub e maschera per una pelle curata.', 15, 30, 9);
