export type User = {
  name: string;
  nickname: string;
  email: string;
};

export const USERS: User[] = [
  { name: '박영규', nickname: '봉구스', email: 'ypungkyu0317@gmail.com' },
  { name: '김우민', nickname: '시오', email: 'mathasdf0@gmail.com' },
  { name: '정재민', nickname: '제이크', email: 'kde2800623@gmail.com' },
  { name: '김선우', nickname: '루디', email: 'sunwoo005@gmail.com' },
  { name: '김기영', nickname: '영기', email: 'cla12093@gmail.com' },
  { name: '박민욱', nickname: '티뉴', email: 'johnprk1993@gmail.com' },
  { name: '윤호준', nickname: '티모', email: 'dbsghwns1209@gmail.com' },
  { name: '김용성', nickname: '티온', email: 'kys990814@gmail.com' },
  { name: '김혜지', nickname: '그해', email: 'khyej.h@gmail.com' },
  { name: '한승규', nickname: '레서', email: 'seunggyuhan0423@gmail.com' },
  { name: '조성진', nickname: '에버', email: 'galmeagi2@gmail.com' },
  { name: '한동희', nickname: '아이큐', email: 'ark182818@gmail.com' },
  { name: '박성열', nickname: '서여', email: 'parkseongyeol2110@gmail.com' },
  { name: '강민재', nickname: '고래', email: 'rkdalswoals@gmail.com' },
  { name: '이도원', nickname: '우디', email: 'armd479@gmail.com' },
  { name: '김수민', nickname: '보예', email: 'new.sumyang@gmail.com' },
  { name: '김제신', nickname: '캐모', email: 'jjason0904@gmail.com' },
  { name: '조경현', nickname: '제이콥', email: 'khcho1492@gmail.com' },
  { name: '김윤서', nickname: '글렌', email: 'jkllhgb@gmail.com' },
  { name: '박다혜', nickname: '라이', email: 'dahye90110@gmail.com' },
  { name: '박재철', nickname: '나무', email: 'symflee@gmail.com' },
  { name: '김성철', nickname: '캐리', email: 'ksc73450056@gmail.com' },
];

const normalize = (email: string) => email.trim().toLowerCase();

export function findUserByEmail(email: string): User | undefined {
  const target = normalize(email);
  return USERS.find((u) => normalize(u.email) === target);
}
