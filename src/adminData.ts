import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  FileClock,
  LayoutDashboard,
  MessageSquareWarning,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type QueueCard = {
  id: string;
  title: string;
  count: number;
  trend: string;
  tone: "green" | "amber" | "blue" | "red";
  icon: LucideIcon;
};

export type ReviewRow = {
  id: string;
  type: string;
  title: string;
  owner: string;
  age: string;
  status: "대기" | "검토중" | "보류";
};

export type AdminContentStatus =
  | "draft"
  | "published"
  | "hidden";

export type AdminContentQueueFilter = AdminContentStatus | "reported" | "deleted";

export type AdminContentItem = {
  id: string;
  title: string;
  summary: string;
  category: string;
  author: string;
  updatedAt: string;
  status: AdminContentStatus;
  reports: number;
  views: number;
  deletedAt: string | null;
  tags: string[];
};

export type AdminUserStatus = "활성" | "정지" | "제재";
export type AdminUserMembershipTier = "member" | "verified_doctor";

export type AdminUserItem = {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  lastActive: string;
  status: AdminUserStatus;
  tier: AdminUserMembershipTier;
};

export const adminNavItems: AdminNavItem[] = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/content", label: "콘텐츠 관리", icon: FileClock },
  { href: "/admin/users", label: "사용자 관리", icon: Users },
  { href: "/admin/doctors", label: "의사 인증", icon: BadgeCheck },
  { href: "/admin/audit", label: "접근 기록", icon: ShieldCheck },
];

export const queueCards: QueueCard[] = [
  {
    id: "content",
    title: "콘텐츠 승인 대기",
    count: 18,
    trend: "오늘 6건 증가",
    tone: "amber",
    icon: FileClock,
  },
  {
    id: "doctors",
    title: "의사 인증 검토",
    count: 7,
    trend: "평균 처리 2.4시간",
    tone: "blue",
    icon: BadgeCheck,
  },
  {
    id: "reports",
    title: "신고 확인 필요",
    count: 4,
    trend: "긴급 1건 포함",
    tone: "red",
    icon: MessageSquareWarning,
  },
  {
    id: "members",
    title: "회원 등급 변경",
    count: 12,
    trend: "자동 승인 9건",
    tone: "green",
    icon: UserRoundCheck,
  },
];

export const adminUserItems: AdminUserItem[] = [
  {
    id: "10021",
    name: "김민수",
    email: "minsu.kim@example.com",
    joinedAt: "2024-01-12",
    lastActive: "2시간 전",
    status: "활성",
    tier: "verified_doctor",
  },
  {
    id: "10044",
    name: "박소연",
    email: "park.seoyeon@example.com",
    joinedAt: "2023-11-03",
    lastActive: "1일 전",
    status: "정지",
    tier: "member",
  },
  {
    id: "10098",
    name: "박준호",
    email: "junho.park@example.com",
    joinedAt: "2024-03-27",
    lastActive: "방금 전",
    status: "제재",
    tier: "member",
  },
  {
    id: "10112",
    name: "최유리",
    email: "yuri.choi@example.com",
    joinedAt: "2024-05-01",
    lastActive: "5분 전",
    status: "활성",
    tier: "verified_doctor",
  },
];

export const adminContentStatusLabels: Record<AdminContentStatus, string> = {
  draft: "초안",
  hidden: "숨김",
  published: "게시됨",
};

export const adminContentQueueLabels: Record<AdminContentQueueFilter, string> = {
  ...adminContentStatusLabels,
  deleted: "삭제됨",
  reported: "신고됨",
};

export const adminContentStatusOrder: AdminContentQueueFilter[] = [
  "reported",
  "deleted",
  "draft",
  "published",
  "hidden",
];

export function getAdminContentQueueState(item: AdminContentItem): AdminContentQueueFilter {
  if (item.deletedAt) return "deleted";
  if (item.reports > 0) return "reported";
  return item.status;
}

export const adminContentItems: AdminContentItem[] = [
  {
    id: "content-1024",
    title: "부적절한 홍보성 게시글",
    summary: "지금 바로 클릭하세요 특가 이벤트...",
    category: "커뮤니티",
    author: "user_kim",
    updatedAt: "12분 전",
    status: "published",
    reports: 3,
    views: 0,
    deletedAt: null,
    tags: ["신고", "홍보"],
  },
  {
    id: "content-1021",
    title: "삭제된 커뮤니티 글",
    summary: "운영정책 위반으로 삭제됨",
    category: "커뮤니티",
    author: "user_lee",
    updatedAt: "오늘 09:20",
    status: "hidden",
    reports: 1,
    views: 42,
    deletedAt: "오늘 09:20",
    tags: ["삭제", "정책"],
  },
  {
    id: "content-1018",
    title: "정상 게시글",
    summary: "오늘 날씨가 참 좋네요.",
    category: "커뮤니티",
    author: "user_park",
    updatedAt: "어제 16:10",
    status: "published",
    reports: 0,
    views: 862,
    deletedAt: null,
    tags: ["일상", "소통"],
  },
  {
    id: "content-1015",
    title: "AI 의료 상담 가이드 업데이트",
    summary: "진료 보조 AI 답변 검수 기준과 환자 안내 문구 변경안",
    category: "가이드",
    author: "콘텐츠팀",
    updatedAt: "2일 전",
    status: "draft",
    reports: 0,
    views: 0,
    deletedAt: null,
    tags: ["AI", "진료 보조", "검수"],
  },
];

export const reviewRows: ReviewRow[] = [
  {
    id: "review-1024",
    type: "콘텐츠",
    title: "AI 의료 상담 가이드 업데이트",
    owner: "콘텐츠팀",
    age: "12분 전",
    status: "대기",
  },
  {
    id: "review-1023",
    type: "인증",
    title: "전문의 면허 인증 자료",
    owner: "김지훈",
    age: "28분 전",
    status: "검토중",
  },
  {
    id: "review-1022",
    type: "신고",
    title: "커뮤니티 게시글 신고",
    owner: "운영 정책",
    age: "44분 전",
    status: "보류",
  },
];
