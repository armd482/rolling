-- 사용자 시드 (schema.sql 실행 후 실행)
-- src/lib/users.ts 의 USERS 와 동일해야 함.
insert into public.users (name, nickname, email) values
  ('박영규','봉구스','ypungkyu0317@gmail.com'),
  ('김우민','시오','mathasdf0@gmail.com'),
  ('정재민','제이크','kde2800623@gmail.com'),
  ('김선우','루디','sunwoo005@gmail.com'),
  ('김기영','영기','cla12093@gmail.com'),
  ('박민욱','티뉴','johnprk1993@gmail.com'),
  ('윤호준','티모','dbsghwns1209@gmail.com'),
  ('김용성','티온','kys990814@gmail.com'),
  ('김혜지','그해','khyej.h@gmail.com'),
  ('한승규','레서','seunggyuhan0423@gmail.com'),
  ('조성진','에버','galmeagi2@gmail.com'),
  ('한동희','아이큐','ark182818@gmail.com'),
  ('박성열','서여','parkseongyeol2110@gmail.com'),
  ('강민재','고래','rkdalswoals@gmail.com'),
  ('이도원','우디','armd479@gmail.com'),
  ('김수민','보예','new.sumyang@gmail.com'),
  ('김제신','캐모','jjason0904@gmail.com'),
  ('조경현','제이콥','khcho1492@gmail.com'),
  ('김윤서','글렌','jkllhgb@gmail.com'),
  ('박다혜','라이','dahye90110@gmail.com'),
  ('박재철','나무','symflee@gmail.com'),
  ('김성철','캐리','ksc73450056@gmail.com')
on conflict (email) do update
  set name = excluded.name, nickname = excluded.nickname;
