import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Bell,
  BookOpen,
  Bookmark,
  Bot,
  ChevronRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Flag,
  FolderOpen,
  Heart,
  House,
  List,
  Link2,
  LogIn,
  LogOut,
  Loader2,
  LockKeyhole,
  Mail,
  MessageCircle,
  Newspaper,
  PencilLine,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Star,
  Stethoscope,
  TrendingUp,
  UserPlus,
  UserRound,
  Video,
  X,
} from "lucide-react";
import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  adminContentItems,
  adminContentQueueLabels,
  adminContentStatusLabels,
  adminContentStatusOrder,
  adminNavItems,
  adminUserItems,
  getAdminContentQueueState,
  type AdminContentItem,
  type AdminContentQueueFilter,
  type AdminContentStatus,
  type AdminUserItem,
  type AdminUserMembershipTier,
  type AdminUserStatus,
} from "./adminData";
import {
  type AdminSession,
  clearAdminSession,
  getAdminSession,
  signInAdmin,
} from "./auth";

type AppRoute = {
  path: string;
  view: "login" | "dashboard" | "content" | "users" | "audit" | "doctors" | "notFound";
};

function getRoute(pathname: string): AppRoute {
  if (pathname === "/" || pathname === "/admin" || pathname === "/admin/dashboard") {
    return { path: "/admin", view: "dashboard" };
  }

  if (pathname === "/admin/login") {
    return { path: "/admin/login", view: "login" };
  }

  if (pathname === "/admin/content") {
    return { path: "/admin/content", view: "content" };
  }

  if (pathname === "/admin/users") {
    return { path: "/admin/users", view: "users" };
  }

  if (pathname === "/admin/audit") {
    return { path: "/admin/audit", view: "audit" };
  }

  if (pathname === "/admin/doctors") {
    return { path: "/admin/doctors", view: "doctors" };
  }

  return { path: pathname, view: "notFound" };
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type PublicRoute = {
  itemId?: string;
  path: string;
  postId?: string;
  view:
    | "home"
    | "browse"
    | "items"
    | "search"
    | "community"
    | "postDetail"
    | "itemEditor"
    | "write"
    | "mypage"
    | "login"
    | "signup"
    | "doctorVerification"
    | "itemDetail"
    | "notFound";
};

type MembershipTier = "member" | "verified_doctor";
type AudienceTier = "guest" | MembershipTier;

const membershipTierLabels: Record<AudienceTier, string> = {
  guest: "비회원",
  member: "일반회원",
  verified_doctor: "의사인증회원",
};

function resolveMembershipTier(email: string): MembershipTier {
  const normalized = email.trim().toLowerCase();
  return normalized.includes("doctor") || normalized.includes("md") || normalized.includes("park.seoyeon")
    ? "verified_doctor"
    : "member";
}

type PublicUser = {
  email: string;
  name: string;
  tier: MembershipTier;
  userId: string;
};

type DoctorVerificationStatus = "pending" | "approved" | "rejected";

type DoctorVerificationApplication = {
  id: string;
  title: string;
  applicantEmail: string;
  applicantName: string;
  licenseNumber: string;
  licenseName: string;
  specialty: string;
  proofFilename: string;
  status: DoctorVerificationStatus;
  submittedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
};

type DoctorVerificationSubmitInput = {
  applicantEmail: string;
  applicantName: string;
  licenseNumber: string;
  licenseName: string;
  specialty: string;
  proofFilename: string;
};

type DoctorVerificationContextValue = {
  applications: DoctorVerificationApplication[];
  approveApplication: (id: string) => void;
  getApplicationForUser: (email: string) => DoctorVerificationApplication | null;
  rejectApplication: (id: string, reason: string) => void;
  submitApplication: (input: DoctorVerificationSubmitInput) => DoctorVerificationApplication;
};

type PendingAction = {
  label: string;
  resume: (user: PublicUser) => void;
};

type HomeState = "default" | "empty" | "loading" | "error" | "permission";
type ItemsScreenState = "default" | "empty" | "loading" | "error" | "permission";
type ItemsSort = "newest" | "popular" | "title";
type CommunityTab = "disease" | "dept";
type CommunitySort = "최신" | "인기" | "동병상련";
type CommunityState = "default" | "empty" | "loading" | "error" | "permission";
type MyPageScreenState = "default" | "empty" | "loading" | "error" | "permission";
type MyPageActivityTab = "posts" | "comments" | "reviews" | "saved";
type ContentEditorScreenState = "default" | "empty" | "loading" | "error" | "permission";
type ContentCategory = "notice" | "free" | "qna";
type ContentStatus = "draft" | "published" | "hidden";

type ContentItem = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: ContentCategory;
  conditionTags: string[];
  status: ContentStatus;
  author: string;
  publishedAt: string;
  updatedAt: string;
  viewCount: number;
  readingMinutes: number;
  searchable: string;
};

type DirectoryItem = {
  id: string;
  name: string;
  hospital: string;
  department: string;
  category: string;
  subcategory: string;
  distanceKm: number;
  patientScore: number;
  peerScore: number;
  verified: boolean;
};

type CommunityPost = {
  id: string;
  author: string;
  initials: string;
  category: string;
  department: string;
  date: string;
  title: string;
  excerpt?: string;
  comments: number;
  empathy: number;
  fellows: number;
  doctorVerified?: boolean;
  visitVerified?: boolean;
  imageCount?: number;
  private?: boolean;
};

type PublicAuthContextValue = {
  user: PublicUser | null;
  pendingAction: PendingAction | null;
  closeAuthModal: () => void;
  login: (email: string) => void;
  logout: () => void;
  requestAuth: (label: string, resume: (user: PublicUser) => void) => void;
};

const PublicAuthContext = createContext<PublicAuthContextValue | null>(null);
const DoctorVerificationContext = createContext<DoctorVerificationContextValue | null>(null);

const browseContentItems = [
  {
    title: "인공지능 임상 세미나",
    category: "Live",
    summary: "전문의가 정리한 AI 진료 보조 사례와 실제 적용 체크리스트",
    meta: "오늘 19:00 · 48명 참여",
  },
  {
    title: "전공의 케이스 노트",
    category: "Guide",
    summary: "수련 단계별로 다시 보는 필수 감별 진단과 처방 흐름",
    meta: "신규 12개 노트",
  },
  {
    title: "면허 인증 커뮤니티",
    category: "Forum",
    summary: "검증된 의료진만 참여하는 질문, 답변, 자료 공유 공간",
    meta: "최근 답변 32개",
  },
];

type ReviewTargetProfile = {
  userId: string;
  name: string;
  title: string;
  specialty: string;
  summary: string;
};

type ProfileReview = {
  id: string;
  targetUserId: string;
  authorUserId: string;
  authorName: string;
  authorSpecialty: string;
  rating: number;
  title: string;
  body: string;
  createdAtLabel: string;
};

type ReviewDraft = {
  rating: number;
  title: string;
  body: string;
};

const reviewTargetProfile: ReviewTargetProfile = {
  userId: "park.seoyeon@aiga.test",
  name: "박서연",
  title: "AI 진료 상담 전문의",
  specialty: "가정의학과 · 임상 AI",
  summary: "진료 보조 AI 적용 경험과 환자 설명 커뮤니케이션을 공유하는 인증 프로필입니다.",
};

const initialProfileReviews: ProfileReview[] = [
  {
    id: "review-park-001",
    targetUserId: reviewTargetProfile.userId,
    authorUserId: "doctor.han@aiga.test",
    authorName: "한지훈",
    authorSpecialty: "내과 전문의",
    rating: 5,
    title: "현장 적용성이 높습니다",
    body: "진료 전 설명 자료를 구성하는 방식이 명확해서 동료 의료진에게 추천하기 좋았습니다.",
    createdAtLabel: "오늘",
  },
  {
    id: "review-park-002",
    targetUserId: reviewTargetProfile.userId,
    authorUserId: "doctor.lee@aiga.test",
    authorName: "이민서",
    authorSpecialty: "응급의학과 전문의",
    rating: 4,
    title: "근거와 한계를 함께 설명합니다",
    body: "AI 결과를 환자에게 안내할 때 주의해야 할 표현까지 함께 다뤄 신뢰도가 높습니다.",
    createdAtLabel: "어제",
  },
  {
    id: "review-park-003",
    targetUserId: reviewTargetProfile.userId,
    authorUserId: "doctor.choi@aiga.test",
    authorName: "최유진",
    authorSpecialty: "영상의학과 전문의",
    rating: 5,
    title: "전문가 관점이 잘 드러납니다",
    body: "사례 기반 설명과 체크리스트가 균형 있게 정리되어 리뷰를 남길 가치가 있었습니다.",
    createdAtLabel: "3일 전",
  },
];

const ratingOptions = [1, 2, 3, 4, 5] as const;
const distributionScores = [5, 4, 3, 2, 1] as const;

function summarizeReviews(reviews: ProfileReview[]) {
  const distribution = distributionScores.reduce<Record<number, number>>((acc, score) => {
    acc[score] = reviews.filter((review) => review.rating === score).length;
    return acc;
  }, {});
  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / count) * 10) / 10
    : 0;

  return {
    averageLabel: count ? average.toFixed(1) : "0.0",
    count,
    distribution,
  };
}

const contentCategoryLabels: Record<ContentCategory, string> = {
  free: "자유",
  notice: "공지",
  qna: "질문/답변",
};

const contentCategoryOptions: Array<{ value: ContentCategory; label: string }> = [
  { value: "free", label: contentCategoryLabels.free },
  { value: "notice", label: contentCategoryLabels.notice },
  { value: "qna", label: contentCategoryLabels.qna },
];

const contentStatusOptions: Array<{ value: ContentStatus; label: string }> = [
  { value: "draft", label: "draft" },
  { value: "published", label: "published" },
  { value: "hidden", label: "hidden" },
];

const contentItems: ContentItem[] = [
  {
    id: "content-lung-checklist",
    title: "폐암 치료 체크리스트",
    summary: "폐암 진단 이후 치료 계획을 확인할 때 필요한 질문과 준비 항목입니다.",
    body:
      "진단명, 병기, 유전자 검사, 수술 가능성, 항암·방사선 치료 계획을 진료 전후로 확인할 수 있도록 정리했습니다.",
    category: "free",
    conditionTags: ["폐암", "수술"],
    status: "published",
    author: "콘텐츠팀",
    publishedAt: "2026.07.01",
    updatedAt: "2026.07.01",
    viewCount: 184,
    readingMinutes: 5,
    searchable: "폐암 치료 체크리스트 수술 항암 방사선 ContentItem free published",
  },
  {
    id: "content-meal-log",
    title: "항암 치료 중 식사 기록",
    summary: "항암 치료 기간의 식사, 수분, 증상 변화를 기록하는 방법을 안내합니다.",
    body:
      "치료 주기별 식사량, 오심, 체중 변화, 복용 약을 함께 기록하면 진료 상담에서 변화를 더 정확히 설명할 수 있습니다.",
    category: "free",
    conditionTags: ["항암", "식사"],
    status: "published",
    author: "영양케어팀",
    publishedAt: "2026.06.28",
    updatedAt: "2026.06.30",
    viewCount: 320,
    readingMinutes: 4,
    searchable: "항암 치료 식사 기록 영양 증상 ContentItem free published",
  },
  {
    id: "content-previsit-questions",
    title: "진료 전 질문 준비법",
    summary: "짧은 진료 시간에 꼭 확인할 질문을 우선순위별로 정리합니다.",
    body:
      "증상 변화, 검사 결과, 복용 중인 약, 생활 제한 사항을 질문 목록으로 준비하면 진료 후 실행 계획을 놓치지 않습니다.",
    category: "qna",
    conditionTags: ["진료", "질문"],
    status: "published",
    author: "Aiga 에디터",
    publishedAt: "2026.06.20",
    updatedAt: "2026.06.24",
    viewCount: 97,
    readingMinutes: 3,
    searchable: "진료 전 질문 준비법 qna ContentItem published",
  },
  {
    id: "content-service-notice",
    title: "서비스 이용 안내",
    summary: "작성 중인 공지 초안입니다.",
    body: "운영자가 게시 전 검토 중인 공지입니다.",
    category: "notice",
    conditionTags: ["공지"],
    status: "draft",
    author: "운영팀",
    publishedAt: "",
    updatedAt: "2026.07.02",
    viewCount: 0,
    readingMinutes: 2,
    searchable: "서비스 이용 안내 notice draft",
  },
];

const directoryItems: DirectoryItem[] = [
  {
    id: "kim-geongang",
    name: "김건강",
    hospital: "서울대학교병원",
    department: "내분비대사내과",
    category: "암",
    subcategory: "위암",
    distanceKm: 1.2,
    patientScore: 98,
    peerScore: 93,
    verified: true,
  },
  {
    id: "lee-geongang",
    name: "이건강",
    hospital: "분당서울대병원",
    department: "간담췌외과",
    category: "암",
    subcategory: "대장암",
    distanceKm: 2.4,
    patientScore: 91,
    peerScore: 88,
    verified: false,
  },
  {
    id: "park-geongang",
    name: "박건강",
    hospital: "서울아산병원",
    department: "흉부외과",
    category: "암",
    subcategory: "위암",
    distanceKm: 3.1,
    patientScore: 95,
    peerScore: 97,
    verified: true,
  },
  {
    id: "choi-geongang",
    name: "최건강",
    hospital: "세브란스병원",
    department: "소화기내과",
    category: "암",
    subcategory: "대장암",
    distanceKm: 4,
    patientScore: 89,
    peerScore: 91,
    verified: false,
  },
  {
    id: "jung-geongang",
    name: "정건강",
    hospital: "삼성서울병원",
    department: "신경외과",
    category: "암",
    subcategory: "폐암",
    distanceKm: 5.2,
    patientScore: 87,
    peerScore: 94,
    verified: true,
  },
];

const itemSortOptions: Array<{ value: ItemsSort; label: string }> = [
  { value: "newest", label: "최신순" },
  { value: "popular", label: "조회순" },
  { value: "title", label: "제목순" },
];

function getInitialItemsState(): ItemsScreenState {
  const state = new URLSearchParams(window.location.search).get("state");

  if (
    state === "empty" ||
    state === "loading" ||
    state === "error" ||
    state === "permission"
  ) {
    return state;
  }

  return "default";
}

const homeStateOptions: Array<{ value: HomeState; label: string }> = [
  { value: "default", label: "기본" },
  { value: "empty", label: "빈 상태" },
  { value: "loading", label: "로딩" },
  { value: "error", label: "오류" },
  { value: "permission", label: "권한" },
];

const bestDoctorTabs = ["위암", "대장암", "갑상선암", "유방암"];

const bestDoctors = [
  {
    rank: 1,
    name: "우예원",
    hospital: "분당서울대병원",
    department: "간담췌외과",
    verified: true,
  },
  {
    rank: 2,
    name: "김건강",
    hospital: "서울아산병원",
    department: "소화기내과",
    verified: false,
  },
  {
    rank: 3,
    name: "이정밀",
    hospital: "세브란스병원",
    department: "외과",
    verified: false,
  },
  {
    rank: 4,
    name: "박회복",
    hospital: "삼성서울병원",
    department: "종양내과",
    verified: false,
  },
];

const appreciationStories = [
  {
    title: "호기심많은너구리...",
    summary:
      "어느 날 갑자기 일상에 스며든 유방암이라는 단어. 낯선 투병의 시간을 함께 지나온 기록입니다.",
    hospital: "순천향대부속서울병원",
    doctor: "신경과 : 김건강",
  },
  {
    title: "보리비 콩콩이",
    summary:
      "수술 전 불안했던 순간부터 회복까지, 의료진의 설명과 돌봄이 큰 힘이 되었습니다.",
    hospital: "서울아산병원",
    doctor: "유방외과 : 김건강",
  },
  {
    title: "새벽의 보호자",
    summary:
      "응급 상황에서 필요한 판단을 차분하게 도와준 진료 경험을 공유합니다.",
    hospital: "국립암센터",
    doctor: "응급의학과 : 이정밀",
  },
];

const communityRecommendations = [
  {
    title: "밤새 열나던 아이, 새벽에 응급실 가야하나 고민했는데...",
    summary:
      "AI가 열성경련 가능성을 체크해줘서 바로 응급실에 갔어요. 빠르게 조치받아 괜찮아졌습니다.",
    author: "하늘별빛",
    time: "2시간 전",
    likes: 120,
    comments: 18,
  },
  {
    title: "검사 결과지를 설명받기 전 미리 정리해 둔 질문",
    summary:
      "진료실에서 놓치지 않으려고 증상, 복용약, 가족력을 한 화면에 정리했습니다.",
    author: "진료메모",
    time: "오늘",
    likes: 84,
    comments: 12,
  },
];

const homeNews = [
  {
    title: "\"많이 써도 안되고 적게 써도 안됩니다\"... 진료실에서 다시 보는 처방 기준",
    date: "2026.06.01",
  },
  {
    title: "\"서울 사는데 다지증 수술 하러 대구에 왔네요!\"",
    date: "2026.06.01",
  },
  {
    title: "대장-항문 로봇 수술 이끄는 병원에서 가장 중시하는 것?",
    date: "2026.06.01",
  },
];

const healthContents = [
  {
    title: "\"대형사고 뉴스 나면 한 달 뒤 중증 환자는 이곳에\"",
    date: "2분전",
  },
  {
    title: "수술 전 보호자가 확인하면 좋은 체크리스트",
    date: "2026.06.01",
  },
  {
    title: "항암 치료 중 식사 기록을 남기는 방법",
    date: "2026.06.01",
  },
  {
    title: "진료 예약 전 증상 변화를 정리하는 기준",
    date: "2026.06.01",
  },
];

const communityCategories: Record<CommunityTab, string[]> = {
  disease: ["전체", "고혈압", "당뇨", "아토피", "비염", "위염", "관절염"],
  dept: ["전체", "내과", "소아청소년과", "피부과", "이비인후과", "정형외과"],
};

const communityPosts: CommunityPost[] = [
  {
    id: "1",
    author: "김건강",
    initials: "김",
    category: "고혈압",
    department: "내과",
    date: "25.05.05",
    title: "밤새 열나던 아이, 새벽에 응급실 가야하나 고민했는데 여기는 너무 친절하고 좋았어요.",
    excerpt:
      "커뮤니티 상세에서 댓글이 0일 때 안내 문구를 확인하기 위한 더미 글입니다. 아래에 첫 댓글을 작성하는 흐름까지 이어집니다.",
    comments: 4,
    empathy: 4,
    fellows: 4,
    doctorVerified: true,
    visitVerified: true,
  },
  {
    id: "2",
    author: "보라비콩콩이",
    initials: "보",
    category: "당뇨",
    department: "내과",
    date: "25.05.05",
    title: "식후 혈당 기록을 같이 보면서 생활 패턴을 조정한 경험을 공유해요.",
    excerpt:
      "아침 운동 시간과 저녁 식사 간격을 조절하니 숫자가 조금씩 안정되는 흐름이 보였습니다.",
    comments: 7,
    empathy: 12,
    fellows: 9,
    imageCount: 3,
  },
  {
    id: "3",
    author: "하늘보호자",
    initials: "하",
    category: "아토피",
    department: "피부과",
    date: "25.05.04",
    title: "보습제를 바꾸고 밤 긁음이 줄어든 기록",
    excerpt:
      "처방 연고 사용 간격을 지키면서 생활 습도를 함께 관리했더니 아이가 잠을 덜 깨기 시작했습니다.",
    comments: 2,
    empathy: 6,
    fellows: 5,
  },
  {
    id: "4",
    author: "관절메모",
    initials: "관",
    category: "관절염",
    department: "정형외과",
    date: "25.05.03",
    title: "비공개 글입니다.",
    comments: 0,
    empathy: 1,
    fellows: 2,
    private: true,
  },
];

function getCommunityPosts(category: string, sort: CommunitySort) {
  const filtered =
    category === "전체"
      ? communityPosts
      : communityPosts.filter(
          (post) => post.category === category || post.department === category,
        );

  return [...filtered].sort((a, b) => {
    if (sort === "인기") {
      return b.empathy - a.empathy;
    }

    if (sort === "동병상련") {
      return b.fellows - a.fellows;
    }

    return 0;
  });
}

const postDetail = {
  id: "run-night",
  title: "한강 야간 러닝 후기",
  body:
    "오늘 처음으로 야간 러닝에 참여했는데 정말 좋았어요. 선선한 바람 맞으며 10km 완주했습니다!\n\n다음 주에도 같이 뛰실 분 댓글 남겨주세요.",
  imageUrl: "https://picsum.photos/seed/run/900/540",
  tags: ["러닝", "한강", "야간"],
  author: {
    name: "김러너",
    meta: "2시간 전 · 러닝 크루",
    avatarUrl: "https://i.pravatar.cc/96?img=12",
  },
  comments: [
    {
      id: "comment-1",
      author: "박마라톤",
      avatarUrl: "https://i.pravatar.cc/64?img=5",
      body: "저도 다음 주 참여할게요!",
      age: "1시간 전",
    },
    {
      id: "comment-2",
      author: "이조깅",
      avatarUrl: "https://i.pravatar.cc/64?img=8",
      body: "사진 너무 멋져요.",
      age: "40분 전",
    },
    {
      id: "comment-3",
      author: "최스프린트",
      avatarUrl: "https://i.pravatar.cc/64?img=15",
      body: "몇 시에 모이나요?",
      age: "10분 전",
    },
  ],
};

type ItemDetailState = "default" | "empty" | "loading" | "error" | "permission";

type ItemDetail = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: ContentCategory;
  conditionTags: string[];
  status: string;
  updatedAt: string;
  relatedItems: Array<{ id: string; title: string; description: string }>;
};

function createContentItemDetail(item: ContentItem): ItemDetail {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    body: item.body,
    category: item.category,
    conditionTags: item.conditionTags,
    status: item.status,
    updatedAt: item.updatedAt,
    relatedItems: [
      {
        id: `${item.id}-save`,
        title: "저장하기",
        description: `${item.title} 콘텐츠를 저장합니다`,
      },
      {
        id: `${item.id}-questions`,
        title: "관련 질문 보기",
        description: `${item.title}와 연결된 질문 글을 확인합니다`,
      },
    ],
  };
}

const itemDetails: Record<string, ItemDetail> = {
  ...Object.fromEntries(
    contentItems
      .filter((item) => item.status === "published")
      .map((item) => [item.id, createContentItemDetail(item)]),
  ),
};

const itemDetailStateValues: ItemDetailState[] = [
  "default",
  "empty",
  "loading",
  "error",
  "permission",
];

function getForcedItemDetailState(): ItemDetailState | null {
  const requestedState = new URLSearchParams(window.location.search).get("state");

  if (itemDetailStateValues.includes(requestedState as ItemDetailState)) {
    return requestedState as ItemDetailState;
  }

  return null;
}

const myPageProfile = {
  name: "손목닥터 코코",
  email: "fassionmap@kakao.com",
  realName: "코코",
  organization: "Aiga 인증 의료진",
  specialty: "가정의학과",
  bio: "환자 경험과 AI 기반 의료 정보를 함께 검토합니다.",
};

const myPageActivityTabs: Array<{
  id: MyPageActivityTab;
  label: string;
  count: number;
}> = [
  { id: "posts", label: "게시글", count: 80 },
  { id: "comments", label: "댓글", count: 20 },
  { id: "reviews", label: "후기", count: 2 },
  { id: "saved", label: "저장", count: 1 },
];

const myPagePosts = [
  {
    title: "운영 정책 위반으로 삭제된 게시글입니다",
    description: "사유: 허위 정보 · 2026.03.10",
    meta: "고혈압 · 25.05.09.",
    stats: "조회 4 · 댓글 4 · 공감 4",
    removed: true,
  },
  {
    title: "밤새 열나던 아이, 새벽에 응급실 가야하나 고민했어요.",
    description: "응급 신호와 관찰 포인트를 정리해 둔 게시글입니다.",
    meta: "고혈압 · 25.05.09.",
    stats: "조회 4 · 댓글 4 · 공감 4",
    removed: false,
  },
  {
    title: "당뇨 환자 운동 전 체크리스트",
    description: "식전 혈당과 저혈당 대처법을 다시 정리했습니다.",
    meta: "당뇨 · 25.05.08.",
    stats: "조회 9 · 댓글 2 · 공감 7",
    removed: false,
  },
];

const myPageComments = [
  {
    body: "참 친절하게 진료해주셨어요. 다음에도 또 방문하고 싶습니다.",
    date: "25.05.05",
  },
];

const myPageReviews = [
  {
    hospital: "경희대학교 병원",
    doctor: "김건강 교수",
    body: "설명이 명확하고 진료 후 관리 방법도 이해하기 쉬웠습니다.",
  },
];

const myPageSavedItem = {
  doctor: "김건강",
  detail: "서울대학교병원 · 내분비대사내과",
};

const initialDoctorVerificationApplications: DoctorVerificationApplication[] = [
  {
    id: "dv-seeded-1",
    title: "전문의 면허 인증 자료",
    applicantEmail: "review-doctor@aiga.test",
    applicantName: "김지훈",
    licenseNumber: "2024-0001",
    licenseName: "김지훈",
    specialty: "내과",
    proofFilename: "specialist-license.pdf",
    status: "pending",
    submittedAt: "2026-07-02T00:00:00.000Z",
  },
];

const doctorVerificationStatusLabels: Record<DoctorVerificationStatus, string> = {
  pending: "검수 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

type SearchResultType = "content" | "directory" | "community";
type SearchFilter = "all" | SearchResultType;
type SearchStatus = "default" | "loading" | "results" | "empty" | "error" | "permission";

type SearchResult = {
  id: string;
  type: SearchResultType;
  entity: "content" | "doctor" | "hospital" | "community";
  title: string;
  subtitle: string;
  summary: string;
  tags: string[];
  meta: string;
  searchable: string;
};

const searchTabs: Array<{ id: SearchResultType; label: string }> = [
  { id: "content", label: "콘텐츠" },
  { id: "directory", label: "디렉터리" },
  { id: "community", label: "커뮤니티" },
];

const searchFilters: Array<{ id: SearchFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "content", label: "콘텐츠" },
  { id: "directory", label: "디렉터리" },
  { id: "community", label: "커뮤니티" },
];

const searchResultSeed: SearchResult[] = [
  {
    id: "content-lung-checklist",
    type: "content",
    entity: "content",
    title: "폐암 치료 체크리스트",
    subtitle: "ContentItem · free",
    summary: "폐암 진단 이후 치료 계획을 확인할 때 필요한 질문과 준비 항목입니다.",
    tags: ["폐암", "수술", "published"],
    meta: "조회 184 · 5분 읽기",
    searchable: "폐암 치료 체크리스트 수술 항암 방사선 ContentItem free published",
  },
  {
    id: "doctor-kim",
    type: "directory",
    entity: "doctor",
    title: "김건강",
    subtitle: "서울대학교병원",
    summary: "흉부외과 전문의 · 폐암 면역치료와 로봇 수술 상담",
    tags: ["흉부외과", "폐암면역치료", "로봇 수술"],
    meta: "★ 5.0 (160) · 1.2km",
    searchable: "폐암 김건강 서울대학교병원 흉부외과 폐암면역치료 로봇 수술",
  },
  {
    id: "hospital-snu",
    type: "directory",
    entity: "hospital",
    title: "서울대학교병원",
    subtitle: "암센터 · 서울 종로구",
    summary: "폐암 정밀 진단, 수술, 항암 치료를 한 번에 안내합니다.",
    tags: ["상급종합병원", "암센터", "흉부외과 협진"],
    meta: "진료 가능 · 1.2km",
    searchable: "폐암 서울대학교병원 암센터 병원 흉부외과",
  },
  {
    id: "community-lung-recovery",
    type: "community",
    entity: "community",
    title: "폐암 수술 후 회복 경험",
    subtitle: "커뮤니티 · 김건강",
    summary: "수술 전후 준비와 회복 기간에 도움이 된 체크리스트를 공유합니다.",
    tags: ["경험담", "회복", "폐암"],
    meta: "댓글 4 · 공감 12",
    searchable: "폐암 수술 회복 경험 커뮤니티 김건강",
  },
];

const searchDelayMs = 120;

const contentEditorCategories = [
  { value: "notice", label: "공지" },
  { value: "free", label: "자유" },
  { value: "qna", label: "질문/답변" },
];

const contentEditorDraftKey = "aiga.content-editor.draft";

function getSearchMatches(query: string, filter: SearchFilter) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const matches = searchResultSeed.filter((result) =>
    result.searchable.toLowerCase().includes(normalizedQuery),
  );

  if (filter === "all") {
    return matches;
  }

  return matches.filter((result) => result.type === filter);
}

function getSearchCounts(results: SearchResult[]) {
  return searchTabs.reduce(
    (counts, tab) => ({
      ...counts,
      [tab.id]: results.filter((result) => result.type === tab.id).length,
    }),
    { content: 0, directory: 0, community: 0 } satisfies Record<SearchResultType, number>,
  );
}

function getFirstVisibleSearchTab(
  results: SearchResult[],
  preferredTab: SearchResultType,
): SearchResultType {
  if (results.some((result) => result.type === preferredTab)) {
    return preferredTab;
  }

  return results[0]?.type ?? "content";
}

function getPublicRoute(pathname: string): PublicRoute {
  if (pathname === "/") {
    return { path: "/", view: "home" };
  }

  if (pathname === "/browse") {
    return { path: "/browse", view: "browse" };
  }

  if (pathname === "/search") {
    return { path: "/search", view: "search" };
  }

  if (pathname === "/items") {
    return { path: "/items", view: "items" };
  }

  if (pathname === "/community") {
    return { path: "/community", view: "community" };
  }

  const postDetailMatch = pathname.match(/^\/community\/posts\/([^/]+)$/);

  if (postDetailMatch) {
    return {
      path: pathname,
      postId: decodeURIComponent(postDetailMatch[1]),
      view: "postDetail",
    };
  }

  if (pathname === "/items/new") {
    return { path: "/items/new", view: "itemEditor" };
  }

  if (pathname === "/write") {
    return { path: "/write", view: "write" };
  }

  if (pathname === "/my" || pathname === "/mypage") {
    return { path: "/my", view: "mypage" };
  }

  if (pathname === "/login") {
    return { path: "/login", view: "login" };
  }

  if (pathname === "/signup") {
    return { path: "/signup", view: "signup" };
  }

  if (pathname === "/doctor-verification") {
    return { path: "/doctor-verification", view: "doctorVerification" };
  }

  if (pathname.startsWith("/items/")) {
    const itemId = decodeURIComponent(pathname.slice("/items/".length));

    if (itemId) {
      return { itemId, path: pathname, view: "itemDetail" };
    }
  }

  return { path: pathname, view: "notFound" };
}

function usePublicAuth() {
  const value = useContext(PublicAuthContext);

  if (!value) {
    throw new Error("usePublicAuth must be used inside PublicAuthProvider");
  }

  return value;
}

function useDoctorVerification() {
  const value = useContext(DoctorVerificationContext);

  if (!value) {
    throw new Error("useDoctorVerification must be used inside DoctorVerificationProvider");
  }

  return value;
}

function PublicAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const requestAuth = useCallback(
    (label: string, resume: (user: PublicUser) => void) => {
      if (user) {
        resume(user);
        return;
      }

      setPendingAction({ label, resume });
    },
    [user],
  );

  const closeAuthModal = useCallback(() => setPendingAction(null), []);

  const login = useCallback(
    (email: string) => {
      const action = pendingAction;
      const normalizedEmail = (email.trim() || "doctor@aiga.test").toLowerCase();
      const name = normalizedEmail.split("@")[0] || "Aiga user";
      const nextUser: PublicUser = {
        email: normalizedEmail,
        name,
        tier: resolveMembershipTier(normalizedEmail),
        userId: normalizedEmail,
      };

      setUser(nextUser);
      setPendingAction(null);

      if (action) {
        action.resume(nextUser);
      }
    },
    [pendingAction],
  );

  const logout = useCallback(() => setUser(null), []);

  const value = useMemo(
    () => ({
      user,
      pendingAction,
      closeAuthModal,
      login,
      logout,
      requestAuth,
    }),
    [closeAuthModal, login, logout, pendingAction, requestAuth, user],
  );

  return (
    <PublicAuthContext.Provider value={value}>
      {children}
      {pendingAction ? <AuthModal /> : null}
    </PublicAuthContext.Provider>
  );
}

function DoctorVerificationProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<DoctorVerificationApplication[]>(
    initialDoctorVerificationApplications,
  );

  const submitApplication = useCallback((input: DoctorVerificationSubmitInput) => {
    const nextApplication: DoctorVerificationApplication = {
      id: `dv-${input.applicantEmail}-${Date.now()}`,
      title: `${input.licenseName} 면허 인증 자료`,
      applicantEmail: input.applicantEmail,
      applicantName: input.applicantName,
      licenseNumber: input.licenseNumber,
      licenseName: input.licenseName,
      specialty: input.specialty,
      proofFilename: input.proofFilename,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };

    setApplications((current) => {
      const existingIndex = current.findIndex(
        (application) => application.applicantEmail === input.applicantEmail,
      );

      if (existingIndex === -1) {
        return [nextApplication, ...current];
      }

      return current.map((application, index) =>
        index === existingIndex ? nextApplication : application,
      );
    });

    return nextApplication;
  }, []);

  const approveApplication = useCallback((id: string) => {
    setApplications((current) =>
      current.map((application) =>
        application.id === id
          ? {
              ...application,
              status: "approved",
              reviewedAt: new Date().toISOString(),
              rejectionReason: undefined,
            }
          : application,
      ),
    );
  }, []);

  const rejectApplication = useCallback((id: string, reason: string) => {
    setApplications((current) =>
      current.map((application) =>
        application.id === id
          ? {
              ...application,
              status: "rejected",
              reviewedAt: new Date().toISOString(),
              rejectionReason: reason.trim() || "증빙 자료를 다시 확인해 주세요.",
            }
          : application,
      ),
    );
  }, []);

  const getApplicationForUser = useCallback(
    (email: string) =>
      applications.find((application) => application.applicantEmail === email) ?? null,
    [applications],
  );

  const value = useMemo(
    () => ({
      applications,
      approveApplication,
      getApplicationForUser,
      rejectApplication,
      submitApplication,
    }),
    [
      applications,
      approveApplication,
      getApplicationForUser,
      rejectApplication,
      submitApplication,
    ],
  );

  return (
    <DoctorVerificationContext.Provider value={value}>
      {children}
    </DoctorVerificationContext.Provider>
  );
}

function AdminApp() {
  const [route, setRoute] = useState(() => getRoute(window.location.pathname));
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());

  useEffect(() => {
    const handleRouteChange = () => {
      flushSync(() => setRoute(getRoute(window.location.pathname)));
    };
    window.addEventListener("popstate", handleRouteChange);

    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  useEffect(() => {
    if (route.view !== "login" && !session) {
      const returnTo = route.path === "/admin" ? "" : `?returnTo=${encodeURIComponent(route.path)}`;
      navigate(`/admin/login${returnTo}`);
      return;
    }

    if (route.view === "login" && session) {
      const params = new URLSearchParams(window.location.search);
      navigate(params.get("returnTo") || "/admin/dashboard");
    }
  }, [route, session]);

  if (route.view === "login") {
    return (
      <AdminLogin
        onSignedIn={(nextSession) => {
          setSession(nextSession);
        }}
      />
    );
  }

  if (!session) {
    return <PageLoading />;
  }

  return (
    <AdminShell
      route={route}
      session={session}
      onLogout={() => {
        clearAdminSession();
        setSession(null);
        navigate("/admin/login");
      }}
    />
  );
}

type AdminLoginStatus = "default" | "empty" | "loading" | "error" | "permission";

const ADMIN_LOGIN_DELAY_MS = 600;

function AdminLogin({ onSignedIn }: { onSignedIn: (session: AdminSession) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<AdminLoginStatus>("default");
  const [showPassword, setShowPassword] = useState(false);

  const isLoading = status === "loading";
  const showEmailEmpty = status === "empty" && !email.trim();
  const showPasswordEmpty = status === "empty" && !password.trim();

  const resetFeedback = () => {
    if (status === "error" || status === "permission") {
      setStatus("default");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setStatus("empty");
      return;
    }

    setStatus("loading");

    window.setTimeout(() => {
      const result = signInAdmin(email, password);

      if (result.status === "success") {
        setStatus("default");
        onSignedIn(result.session);
        return;
      }

      setStatus(result.status);
    }, ADMIN_LOGIN_DELAY_MS);
  };

  return (
    <main className="login-screen">
      <section className="login-layout" data-device="desktop" data-screen="SCR-011" id="SCR-011">
        <div className="login-hero">
          <div className="brand-lockup admin-console-lockup">
            <span className="brand-mark" aria-hidden="true">
              A
            </span>
            <strong>Admin Console</strong>
          </div>
          <h1>운영자 관리 영역</h1>
          <p>관리자 계정으로 로그인하여 서비스 운영 도구에 접근하세요.</p>
          <ul>
            <li>
              <span aria-hidden="true" />
              안전한 관리자 인증
            </li>
            <li>
              <span aria-hidden="true" />
              권한 기반 접근 제어
            </li>
            <li>
              <span aria-hidden="true" />
              대시보드 및 운영 도구
            </li>
          </ul>
        </div>

        <section className="login-panel" aria-labelledby="admin-login-title">
          <div className="mobile-admin-lockup">
            <span className="brand-mark" aria-hidden="true">
              A
            </span>
            <strong>Admin Console</strong>
          </div>

          <div className="login-panel-heading">
            <h1 id="admin-login-title">관리자 로그인</h1>
            <p>운영자가 관리자 영역에 접근하기 위해 로그인합니다.</p>
            <span className="route-badge">/admin/login · 공개</span>
          </div>

          {status === "permission" ? (
            <div className="login-alert permission" role="alert">
              <AlertCircle size={20} aria-hidden="true" />
              <span>관리자 권한이 없는 계정입니다. 접근이 제한되었습니다.</span>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="login-alert error" role="alert">
              <AlertCircle size={20} aria-hidden="true" />
              <div>
                <span>이메일 또는 비밀번호가 올바르지 않습니다.</span>
                <small>입력값을 확인한 후 다시 시도해 주세요.</small>
              </div>
            </div>
          ) : null}

          <form className="login-form" noValidate onSubmit={handleSubmit}>
            <div className="form-control">
              <label className="field-label" htmlFor="admin-email">
                이메일
              </label>
              <div className="login-input-shell">
                <Mail size={17} aria-hidden="true" />
                <input
                  aria-describedby={showEmailEmpty ? "admin-email-error" : undefined}
                  aria-invalid={showEmailEmpty}
                  autoComplete="username"
                  data-testid="scr-011-fld-01"
                  id="admin-email"
                  inputMode="email"
                  name="email"
                  onChange={(event) => {
                    resetFeedback();
                    setEmail(event.target.value);
                  }}
                  placeholder="admin@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
              {showEmailEmpty ? (
                <p className="field-error" id="admin-email-error">
                  이메일을 입력해 주세요.
                </p>
              ) : null}
            </div>

            <div className="form-control">
              <label className="field-label" htmlFor="admin-password">
                비밀번호
              </label>
              <div className="login-input-shell">
                <LockKeyhole size={17} aria-hidden="true" />
                <input
                  aria-describedby={showPasswordEmpty ? "admin-password-error" : undefined}
                  aria-invalid={showPasswordEmpty}
                  autoComplete="current-password"
                  data-testid="scr-011-fld-02"
                  id="admin-password"
                  name="password"
                  onChange={(event) => {
                    resetFeedback();
                    setPassword(event.target.value);
                  }}
                  placeholder="비밀번호"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                  className="password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff size={16} aria-hidden="true" />
                  ) : (
                    <Eye size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
              {showPasswordEmpty ? (
                <p className="field-error" id="admin-password-error">
                  비밀번호를 입력해 주세요.
                </p>
              ) : null}
            </div>

            <div className="login-action-field" data-testid="scr-011-fld-03">
              <button
                aria-busy={isLoading}
                className="primary-button"
                data-action="ACT-01"
                data-api="API-001"
                data-next="SCR-012"
                data-testid="scr-011-act-01"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? (
                  <Loader2 className="spin-icon" size={18} aria-hidden="true" />
                ) : (
                  <ShieldCheck size={18} aria-hidden="true" />
                )}
                {isLoading ? "로그인 중..." : "로그인"}
              </button>
            </div>
          </form>

          <div className="login-divider">SCR-011 · API-001 → SCR-012</div>
          <p className="login-support-copy">권한 문제가 있으신가요? 시스템 관리자에게 문의하세요.</p>
        </section>
      </section>
    </main>
  );
}

function AdminShell({
  route,
  session,
  onLogout,
}: {
  route: AppRoute;
  session: AdminSession;
  onLogout: () => void;
}) {
  const pageTitle = useMemo(() => {
    const activeItem = adminNavItems.find((item) => item.href === route.path);
    return activeItem?.label || "관리자";
  }, [route.path]);

  return (
    <div className="admin-shell">
      <aside className="sidebar" aria-label="관리자 메뉴">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <div>
            <p>Aiga</p>
            <strong>Admin</strong>
          </div>
        </div>

        <nav className="sidebar-nav">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === route.path;

            return (
              <button
                className={isActive ? "nav-item active" : "nav-item"}
                key={item.href}
                onClick={() => navigate(item.href)}
                type="button"
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">운영 콘솔</p>
            <h1>{pageTitle}</h1>
          </div>

          <div className="topbar-actions">
            <label className="search-control" aria-label="관리 항목 검색">
              <Search size={17} aria-hidden="true" />
              <input placeholder="검색" type="search" />
            </label>
            <button className="icon-button" type="button" aria-label="알림">
              <Bell size={18} aria-hidden="true" />
            </button>
            <div className="admin-profile">
              <UserRound size={17} aria-hidden="true" />
              <span>{session.name}</span>
            </div>
            <button className="ghost-button" type="button" onClick={onLogout}>
              <LogOut size={17} aria-hidden="true" />
              로그아웃
            </button>
          </div>
        </header>

        <main className="page-content">
          {route.view === "dashboard" ? <Dashboard /> : null}
          {route.view === "content" ? <AdminContentPage /> : null}
          {route.view === "users" ? <AdminUsersPage session={session} /> : null}
          {route.view === "audit" ? <PlaceholderPage title="접근 기록" /> : null}
          {route.view === "doctors" ? <AdminDoctorVerificationPage /> : null}
          {route.view === "notFound" ? <PlaceholderPage title="페이지를 찾을 수 없습니다" /> : null}
        </main>
      </div>
    </div>
  );
}

type AdminDashboardScreenState = "default" | "empty" | "loading" | "error" | "permission";

const adminDashboardStateOptions: AdminDashboardScreenState[] = [
  "default",
  "empty",
  "loading",
  "error",
  "permission",
];

const adminDashboardMetrics = [
  { label: "대기 총건수", value: "128", description: "전일 대비 +12", tone: "blue" },
  { label: "오늘 처리", value: "87", description: "처리율 68%", tone: "green" },
  { label: "SLA 위반", value: "4", description: "즉시 확인 필요", tone: "red" },
  { label: "평균 처리시간", value: "2.4h", description: "전주 대비 -0.3h", tone: "amber" },
] as const;

const adminDashboardQueues = [
  {
    id: "new-signups",
    priority: "긴급",
    title: "신규 가입 승인 대기",
    summary: "42건 · SLA 위반 2건",
    tone: "red",
  },
  {
    id: "refunds",
    priority: "주의",
    title: "환불 요청 검토",
    summary: "31건 · 평균 대기 1.8h",
    tone: "amber",
  },
  {
    id: "inquiries",
    priority: "일반",
    title: "문의 답변 대기",
    summary: "55건 · 평균 대기 0.9h",
    tone: "blue",
  },
] as const;

const adminDashboardShortcuts = [
  { label: "사용자 관리", path: "/admin/users", icon: UserRound },
  { label: "콘텐츠 관리", path: "/admin/content", icon: FolderOpen },
  { label: "접근 기록", path: "/admin/audit", icon: List },
] as const;

function Dashboard() {
  const [screenState, setScreenState] = useState<AdminDashboardScreenState>("default");
  const [toastMessage, setToastMessage] = useState("");

  const showDefaultState = screenState === "default";

  const handlePreviewState = (nextState: AdminDashboardScreenState) => {
    setToastMessage("");
    setScreenState(nextState);
  };

  const recoverDashboard = () => {
    setToastMessage("");
    setScreenState("loading");
    window.setTimeout(() => setScreenState("default"), 120);
  };

  const handleQueueSelect = (queueTitle: string) => {
    setToastMessage(`${queueTitle} 처리 상세 화면(SCR-013)으로 이동합니다. API-001`);
  };

  return (
    <section
      className="admin-dashboard-page"
      data-device="desktop"
      data-screen="SCR-012"
      data-state={screenState}
      id="SCR-012"
    >
      <div className="admin-dashboard-header">
        <div>
          <div className="admin-dashboard-title">
            <h2 id="scr-012-title">Admin 대시보드</h2>
            <span className="admin-badge">관리자</span>
          </div>
          <p>운영 처리 대기 큐와 핵심 지표를 카드로 표시합니다.</p>
        </div>
        <button className="ghost-button compact" onClick={recoverDashboard} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          새로고침
        </button>
      </div>

      {screenState === "permission" ? (
        <section className="admin-state-panel warning" role="alert">
          <LockKeyhole size={24} aria-hidden="true" />
          <div>
            <strong>접근 권한이 없습니다</strong>
            <p>이 화면은 관리자 권한이 필요합니다.</p>
          </div>
        </section>
      ) : null}

      {screenState === "error" ? (
        <section className="admin-state-panel error" role="alert">
          <AlertCircle size={24} aria-hidden="true" />
          <div>
            <strong>데이터를 불러오지 못했습니다</strong>
            <p>네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          <button className="ghost-button compact" onClick={recoverDashboard} type="button">
            다시 시도
          </button>
        </section>
      ) : null}

      {screenState === "loading" ? (
        <section className="admin-state-panel loading" role="status">
          <Loader2 className="spin-icon" size={24} aria-hidden="true" />
          <div>
            <strong>Admin 대시보드 데이터를 불러오는 중입니다.</strong>
            <p>API-001 응답을 기다리고 있습니다.</p>
          </div>
        </section>
      ) : null}

      {screenState === "empty" ? (
        <section className="admin-state-panel empty">
          <CheckCircle2 size={24} aria-hidden="true" />
          <div>
            <strong>처리할 항목이 없습니다</strong>
            <p>현재 대기 중인 큐가 없습니다. 모든 항목이 처리되었습니다.</p>
          </div>
        </section>
      ) : null}

      {showDefaultState ? (
        <div className="admin-dashboard-content">
          <section
            aria-labelledby="scr-012-metrics-title"
            className="dashboard-section"
            data-field="metrics"
            data-testid="scr-012-fld-02"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">핵심 지표</p>
                <h3 id="scr-012-metrics-title">운영 현황</h3>
              </div>
            </div>
            <div className="metric-grid">
              {adminDashboardMetrics.map((metric) => (
                <article className={`metric-card ${metric.tone}`} key={metric.label}>
                  <div>
                    <p>{metric.label}</p>
                    <strong>{metric.value}</strong>
                    <span>{metric.description}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="admin-dashboard-main-grid">
            <section className="dashboard-section" aria-labelledby="scr-012-queues-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">처리 대기</p>
                  <h3 id="scr-012-queues-title">처리 대기 큐</h3>
                </div>
                <span className="admin-users-count">{adminDashboardQueues.length}건</span>
              </div>
              <p className="admin-dashboard-section-copy">
                카드를 선택하면 상세 처리 화면으로 이동합니다.
              </p>
              <div
                className="admin-dashboard-queue-list"
                data-field="queues"
                data-testid="scr-012-fld-01"
              >
                {adminDashboardQueues.map((queue) => (
                  <button
                    className="admin-dashboard-queue-card"
                    data-act="ACT-01"
                    data-api="API-001"
                    data-testid="scr-012-act-01"
                    key={queue.id}
                    onClick={() => handleQueueSelect(queue.title)}
                    type="button"
                  >
                    <span className={`admin-dashboard-priority ${queue.tone}`}>{queue.priority}</span>
                    <span>
                      <strong>{queue.title}</strong>
                      <small>{queue.summary}</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>

            <section className="dashboard-section" aria-labelledby="scr-012-shortcuts-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">빠른 이동</p>
                  <h3 id="scr-012-shortcuts-title">바로가기</h3>
                </div>
              </div>
              <div
                className="admin-dashboard-shortcuts"
                data-field="shortcuts"
                data-testid="scr-012-fld-03"
              >
                {adminDashboardShortcuts.map((shortcut) => {
                  const Icon = shortcut.icon;

                  return (
                    <button
                      className="ghost-button admin-dashboard-shortcut"
                      key={shortcut.path}
                      onClick={() => navigate(shortcut.path)}
                      type="button"
                    >
                      <Icon size={16} aria-hidden="true" />
                      {shortcut.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      <div className="admin-state-preview" aria-label="SCR-012 상태 미리보기">
        {adminDashboardStateOptions.map((state) => (
          <button
            aria-pressed={screenState === state}
            key={state}
            onClick={() => handlePreviewState(state)}
            type="button"
          >
            {state}
          </button>
        ))}
      </div>

      {toastMessage ? (
        <div className="admin-toast" role="status">
          {toastMessage}
        </div>
      ) : null}
    </section>
  );
}

function AdminDoctorVerificationPage() {
  const { applications, approveApplication, rejectApplication } = useDoctorVerification();
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const pendingCount = applications.filter((application) => application.status === "pending").length;

  return (
    <div className="dashboard-grid">
      <section className="dashboard-section" aria-labelledby="doctor-verification-admin-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Doctor verification</p>
            <h2 id="doctor-verification-admin-title">의사 인증 검토</h2>
          </div>
          <span className="admin-verification-count">대기 {pendingCount}건</span>
        </div>

        <div className="admin-verification-list" role="list">
          {applications.map((application) => {
            const reason = rejectionReasons[application.id] ?? "";
            const isPending = application.status === "pending";

            return (
              <article className="admin-verification-row" key={application.id} role="listitem">
                <div className="admin-verification-main">
                  <div>
                    <span className="row-type">인증</span>
                    <h3>{application.title}</h3>
                    <p>
                      {application.applicantName} · {application.specialty || "전문과목 미입력"}
                    </p>
                  </div>
                  <span className={`verification-status ${application.status}`}>
                    {doctorVerificationStatusLabels[application.status]}
                  </span>
                </div>

                <dl className="verification-metadata">
                  <div>
                    <dt>면허번호</dt>
                    <dd>{application.licenseNumber}</dd>
                  </div>
                  <div>
                    <dt>면허상 이름</dt>
                    <dd>{application.licenseName}</dd>
                  </div>
                  <div>
                    <dt>증빙</dt>
                    <dd>{application.proofFilename}</dd>
                  </div>
                </dl>

                {application.status === "approved" ? (
                  <p className="verification-result approved">
                    의사인증회원으로 등급이 상향되었습니다.
                  </p>
                ) : null}
                {application.status === "rejected" ? (
                  <p className="verification-result rejected">
                    반려 사유: {application.rejectionReason}
                  </p>
                ) : null}

                <div className="admin-verification-actions">
                  <label>
                    <span className="sr-only">{application.title} 반려 사유</span>
                    <input
                      aria-label={`${application.title} 반려 사유`}
                      disabled={!isPending}
                      onChange={(event) =>
                        setRejectionReasons((current) => ({
                          ...current,
                          [application.id]: event.target.value,
                        }))
                      }
                      placeholder="반려 사유"
                      value={reason}
                    />
                  </label>
                  <button
                    aria-label={`${application.title} 승인`}
                    className="primary-button"
                    disabled={!isPending}
                    onClick={() => approveApplication(application.id)}
                    type="button"
                  >
                    <CheckCircle2 size={17} aria-hidden="true" />
                    승인
                  </button>
                  <button
                    aria-label={`${application.title} 반려`}
                    className="ghost-button"
                    disabled={!isPending}
                    onClick={() => rejectApplication(application.id, reason)}
                    type="button"
                  >
                    <X size={17} aria-hidden="true" />
                    반려
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type AdminContentScreenState = "default" | "empty" | "loading" | "error" | "permission";
type AdminContentFilter = "all" | AdminContentQueueFilter;
type AdminContentDecisionAction = "delete" | "restore" | "reject";

const adminContentStateOptions: AdminContentScreenState[] = [
  "default",
  "empty",
  "loading",
  "error",
  "permission",
];

function filterAdminContentItems(
  items: AdminContentItem[],
  keyword: string,
  filter: AdminContentFilter,
) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return items.filter((item) => {
    const queueState = getAdminContentQueueState(item);
    const matchesStatus =
      filter === "all" ||
      queueState === filter ||
      (!item.deletedAt && item.status === filter);
    const searchableText = [
      item.title,
      item.summary,
      item.category,
      item.author,
      adminContentQueueLabels[queueState],
      adminContentStatusLabels[item.status],
      ...item.tags,
    ]
      .join(" ")
      .toLowerCase();

    return matchesStatus && (!normalizedKeyword || searchableText.includes(normalizedKeyword));
  });
}

function AdminContentPage() {
  const [items, setItems] = useState<AdminContentItem[]>(() => [...adminContentItems]);
  const [visibleItems, setVisibleItems] = useState<AdminContentItem[]>(() => [
    ...adminContentItems,
  ]);
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<AdminContentFilter>("all");
  const [screenState, setScreenState] = useState<AdminContentScreenState>("default");
  const [toastMessage, setToastMessage] = useState("");
  const [decision, setDecision] = useState<{
    action: AdminContentDecisionAction;
    item: AdminContentItem;
  } | null>(null);
  const searchTimerRef = useRef<number | null>(null);

  const clearSearchTimer = useCallback(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearSearchTimer, [clearSearchTimer]);

  const runAfterLoading = useCallback(
    (nextStep: () => void) => {
      clearSearchTimer();
      setScreenState("loading");
      searchTimerRef.current = window.setTimeout(() => {
        searchTimerRef.current = null;
        nextStep();
      }, 180);
    },
    [clearSearchTimer],
  );

  const applyVisibleItems = (nextItems: AdminContentItem[]) => {
    const matches = filterAdminContentItems(nextItems, keyword, filter);
    setVisibleItems(matches);
    setScreenState(matches.length > 0 ? "default" : "empty");
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToastMessage("");
    runAfterLoading(() => {
      const normalizedKeyword = keyword.trim().toLowerCase();

      if (normalizedKeyword === "오류" || normalizedKeyword === "error") {
        setScreenState("error");
        return;
      }

      applyVisibleItems(items);
    });
  };

  const handleRetry = () => {
    setKeyword("");
    setFilter("all");
    setToastMessage("");
    runAfterLoading(() => {
      setVisibleItems(items);
      setScreenState("default");
    });
  };

  const handlePreviewState = (nextState: AdminContentScreenState) => {
    clearSearchTimer();
    setToastMessage("");
    setScreenState(nextState);

    if (nextState === "default") {
      setVisibleItems(items);
    }

    if (nextState === "empty") {
      setVisibleItems([]);
    }
  };

  const openDecision = (action: AdminContentDecisionAction, item: AdminContentItem) => {
    if (screenState === "permission") {
      return;
    }

    setDecision({ action, item });
  };

  const closeDecision = () => setDecision(null);

  const confirmDecision = () => {
    if (!decision) {
      return;
    }

    const nextStatus: Record<AdminContentDecisionAction, AdminContentStatus> = {
      delete: "hidden",
      restore: "published",
      reject: "hidden",
    };
    const nextMessage: Record<AdminContentDecisionAction, string> = {
      delete: "삭제 처리되었습니다. API-001",
      restore: "복원 처리되었습니다. API-001",
      reject: "반려 처리되었습니다. API-001",
    };
    const nextItems = items.map((item) =>
      item.id === decision.item.id
        ? {
            ...item,
            deletedAt:
              decision.action === "delete"
                ? "방금 전"
                : decision.action === "restore"
                  ? null
                  : item.deletedAt,
            reports: decision.action === "reject" ? 0 : item.reports,
            status: nextStatus[decision.action],
            updatedAt: "방금 전",
          }
        : item,
    );

    setItems(nextItems);
    setVisibleItems(filterAdminContentItems(nextItems, keyword, filter));
    setToastMessage(nextMessage[decision.action]);
    setScreenState("default");
    closeDecision();
  };

  const showList = screenState === "default";

  return (
    <section className="admin-content-page" data-screen="SCR-013" id="SCR-013">
      <div className="admin-content-header">
        <div>
          <p className="eyebrow">Admin / 콘텐츠 관리</p>
          <h2>Admin 콘텐츠 관리</h2>
          <p>콘텐츠와 신고 항목을 검색, 필터링하고 삭제, 복원, 반려로 운영합니다.</p>
        </div>
        <span className="admin-badge">SCR-013</span>
      </div>

      {screenState === "permission" ? (
        <div className="admin-state-panel warning" data-testid="scr-013-permission" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <span>이 작업을 수행할 권한이 없습니다.</span>
        </div>
      ) : null}

      <section className="admin-content-search-panel" aria-label="콘텐츠 검색">
        <form className="admin-content-search-form" onSubmit={handleSearch}>
          <label className="admin-content-search-input">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">검색어</span>
            <input
              data-field="keyword"
              data-testid="scr-013-fld-01"
              disabled={screenState === "permission"}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="제목, 작성자, 내용 검색"
              type="search"
              value={keyword}
            />
          </label>
          <label className="admin-content-filter">
            <span>상태 필터</span>
            <select
              data-field="filter"
              data-testid="scr-013-fld-02"
              disabled={screenState === "permission"}
              onChange={(event) => setFilter(event.target.value as AdminContentFilter)}
              value={filter}
            >
              <option value="all">전체</option>
              {adminContentStatusOrder.map((status) => (
                <option key={status} value={status}>
                  {adminContentQueueLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            data-testid="scr-013-act-01"
            disabled={screenState === "permission"}
            type="submit"
          >
            <Search size={17} aria-hidden="true" />
            검색
          </button>
        </form>
      </section>

      {screenState === "loading" ? (
        <section className="admin-state-panel loading" data-testid="scr-013-loading" role="status">
          <Loader2 className="spin" size={24} aria-hidden="true" />
          <div>
            <strong>콘텐츠 목록을 불러오는 중입니다.</strong>
            <p>API-001 응답을 확인하고 있습니다.</p>
          </div>
        </section>
      ) : null}

      {screenState === "error" ? (
        <section className="admin-state-panel error" data-testid="scr-013-error" role="alert">
          <AlertCircle size={24} aria-hidden="true" />
          <div>
            <strong>콘텐츠를 불러오지 못했습니다.</strong>
            <p>네트워크 상태를 확인한 후 다시 시도해 주세요.</p>
            <button className="ghost-button compact" onClick={handleRetry} type="button">
              <RefreshCw size={16} aria-hidden="true" />
              다시 시도
            </button>
          </div>
        </section>
      ) : null}

      {screenState === "empty" ? (
        <section className="admin-state-panel empty" data-testid="scr-013-empty">
          <FolderOpen size={24} aria-hidden="true" />
          <div>
            <strong>결과가 없습니다.</strong>
            <p>검색어나 필터를 변경해 보세요.</p>
          </div>
        </section>
      ) : null}

      {showList ? (
        <section className="admin-content-table-panel" aria-labelledby="scr-013-list-title">
          <div className="content-list-header">
            <h3 id="scr-013-list-title">콘텐츠 목록</h3>
            <span>{visibleItems.length}건</span>
          </div>
          <div className="admin-content-table-wrap">
            <table className="admin-content-table" data-field="itemList" data-testid="scr-013-fld-03">
              <thead>
                <tr>
                  <th>제목 / 내용</th>
                  <th>작성자</th>
                  <th>상태</th>
                  <th>신고</th>
                  <th className="text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const queueState = getAdminContentQueueState(item);

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <p>{item.summary}</p>
                      </td>
                      <td>{item.author}</td>
                      <td>
                        <span className={`content-status-pill ${queueState}`}>
                          {adminContentQueueLabels[queueState]}
                        </span>
                      </td>
                      <td>{item.reports}</td>
                      <td className="text-right">
                        <div className="content-row-actions">
                          {!item.deletedAt ? (
                            <button
                              className="ghost-button compact-action danger-action"
                              data-testid="scr-013-act-02"
                              onClick={() => openDecision("delete", item)}
                              type="button"
                            >
                              삭제
                            </button>
                          ) : null}
                          {item.deletedAt ? (
                            <button
                              className="ghost-button compact-action"
                              data-testid="scr-013-act-03"
                              onClick={() => openDecision("restore", item)}
                              type="button"
                            >
                              복원
                            </button>
                          ) : null}
                          {!item.deletedAt && (item.reports > 0 || item.status === "draft") ? (
                            <button
                              className="ghost-button compact-action"
                              data-testid="scr-013-act-04"
                              onClick={() => openDecision("reject", item)}
                              type="button"
                            >
                              반려
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {toastMessage ? (
        <p className="content-update-message" role="status">
          {toastMessage}
        </p>
      ) : null}

      {decision ? (
        <section
          aria-labelledby="scr-013-decision-title"
          aria-modal="true"
          className="admin-decision-dialog"
          data-field="decision"
          data-testid="scr-013-fld-04"
          role="dialog"
        >
          <h3 id="scr-013-decision-title">처리 확인</h3>
          <p>{decision.item.title} 항목을 처리합니다.</p>
          <label>
            처리 사유
            <textarea placeholder="사유를 입력하세요" />
          </label>
          <div className="admin-decision-actions">
            <button className="ghost-button" onClick={closeDecision} type="button">
              취소
            </button>
            <button className="primary-button" onClick={confirmDecision} type="button">
              확인
            </button>
          </div>
        </section>
      ) : (
        <div data-field="decision" data-testid="scr-013-fld-04" hidden />
      )}

      <div className="admin-state-preview" aria-label="SCR-013 상태 미리보기">
        {adminContentStateOptions.map((state) => (
          <button key={state} onClick={() => handlePreviewState(state)} type="button">
            {state}
          </button>
        ))}
      </div>
    </section>
  );
}

type AdminUsersScreenState = "default" | "empty" | "loading" | "error" | "permission";

const adminUserStatusOptions: AdminUserStatus[] = ["활성", "정지", "제재"];
const adminUserTierOptions: AdminUserMembershipTier[] = ["member", "verified_doctor"];
const adminUserStateOptions: AdminUsersScreenState[] = [
  "default",
  "empty",
  "loading",
  "error",
  "permission",
];

function getAdminUserInitials(name: string) {
  return name.slice(0, 2);
}

function getAdminUserStatusClass(status: AdminUserStatus) {
  if (status === "활성") return "status-active";
  if (status === "정지") return "status-suspended";
  return "status-sanctioned";
}

function filterAdminUsers(users: AdminUserItem[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return users;
  }

  return users.filter((user) =>
    [user.id, user.name, user.email, user.status, membershipTierLabels[user.tier]]
      .join(" ")
      .toLowerCase()
      .includes(normalizedKeyword),
  );
}

function AdminUsersPage({ session }: { session: AdminSession }) {
  const hasAdminPermission = session.role === "admin";
  const [keyword, setKeyword] = useState("");
  const [users, setUsers] = useState<AdminUserItem[]>(adminUserItems);
  const [visibleUsers, setVisibleUsers] = useState<AdminUserItem[]>(adminUserItems);
  const [screenState, setScreenState] = useState<AdminUsersScreenState>(
    hasAdminPermission ? "default" : "permission",
  );
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const searchTimerRef = useRef<number | null>(null);

  const clearSearchTimer = useCallback(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearSearchTimer, [clearSearchTimer]);

  const runAfterLoading = useCallback(
    (nextStep: () => void) => {
      clearSearchTimer();
      setScreenState("loading");
      searchTimerRef.current = window.setTimeout(() => {
        searchTimerRef.current = null;
        nextStep();
      }, 220);
    },
    [clearSearchTimer],
  );

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasAdminPermission) {
      setScreenState("permission");
      return;
    }

    const nextKeyword = keyword.trim();
    setToastMessage("");
    runAfterLoading(() => {
      if (nextKeyword === "오류" || nextKeyword.toLowerCase() === "error") {
        setScreenState("error");
        return;
      }

      const matches = filterAdminUsers(users, nextKeyword);
      setVisibleUsers(matches);
      setScreenState(matches.length > 0 ? "default" : "empty");

      if (matches.length > 0) {
        setToastMessage("검색 완료했습니다. API-001");
      }
    });
  };

  const handleReset = () => {
    clearSearchTimer();
    setKeyword("");
    setVisibleUsers(users);
    setScreenState(hasAdminPermission ? "default" : "permission");
    setToastMessage("");
  };

  const handleRetry = () => {
    setKeyword("");
    setToastMessage("");
    runAfterLoading(() => {
      setVisibleUsers(users);
      setScreenState(hasAdminPermission ? "default" : "permission");
    });
  };

  const handlePreviewState = (nextState: AdminUsersScreenState) => {
    clearSearchTimer();
    setToastMessage("");
    setScreenState(nextState);

    if (nextState === "default") {
      setVisibleUsers(users);
    }

    if (nextState === "empty") {
      setVisibleUsers([]);
    }
  };

  const handleStatusChange = (userId: string, status: AdminUserStatus) => {
    const targetUser = users.find((user) => user.id === userId);
    const nextUsers = users.map((user) => (user.id === userId ? { ...user, status } : user));

    setUsers(nextUsers);
    setVisibleUsers((currentUsers) =>
      currentUsers.map((user) => (user.id === userId ? { ...user, status } : user)),
    );
    setSelectedUser((currentUser) =>
      currentUser?.id === userId ? { ...currentUser, status } : currentUser,
    );
    setToastMessage(`${targetUser?.name || "회원"} 상태를 ${status}(으)로 변경했습니다. API-001`);
  };

  const handleTierChange = (userId: string, tier: AdminUserMembershipTier) => {
    const targetUser = users.find((user) => user.id === userId);
    const nextUsers = users.map((user) => (user.id === userId ? { ...user, tier } : user));

    setUsers(nextUsers);
    setVisibleUsers((currentUsers) =>
      currentUsers.map((user) => (user.id === userId ? { ...user, tier } : user)),
    );
    setSelectedUser((currentUser) =>
      currentUser?.id === userId ? { ...currentUser, tier } : currentUser,
    );
    setToastMessage(
      `${targetUser?.name || "회원"} 회원 등급을 ${membershipTierLabels[tier]}으로 변경했습니다.`,
    );
  };

  return (
    <section className="admin-users-page" aria-labelledby="scr-014-title">
      <div className="admin-users-header">
        <div>
          <div className="admin-users-title">
            <h2 id="scr-014-title">Admin 사용자 관리</h2>
            <span className="admin-badge">관리자</span>
          </div>
          <p>회원을 검색하고 가입일, 활동, 제재 상태를 조회하고 처리합니다.</p>
        </div>
        <nav className="admin-breadcrumb" aria-label="관리자 경로">
          <span>/admin</span>
          <ChevronRight size={14} aria-hidden="true" />
          <strong>users</strong>
        </nav>
      </div>

      {screenState === "permission" ? (
        <div className="admin-state-panel warning" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <span>이 화면은 관리자 권한이 필요합니다.</span>
        </div>
      ) : null}

      <section className="admin-users-search-panel" aria-label="회원 검색">
        <form className="admin-users-search-form" onSubmit={handleSearch}>
          <label className="admin-users-search-input">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">회원 검색어</span>
            <input
              data-field="keyword"
              data-testid="scr-014-fld-01"
              disabled={screenState === "permission"}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="이름, 이메일, ID로 회원 검색"
              type="search"
              value={keyword}
            />
          </label>
          <div className="admin-users-actions">
            <button
              className="primary-button"
              data-testid="scr-014-act-01"
              disabled={screenState === "permission"}
              type="submit"
            >
              <Search size={17} aria-hidden="true" />
              검색
            </button>
            <button className="ghost-button" onClick={handleReset} type="button">
              <RefreshCw size={17} aria-hidden="true" />
              초기화
            </button>
          </div>
        </form>
      </section>

      {screenState === "loading" ? (
        <section
          aria-label="회원 목록 불러오는 중"
          className="admin-state-panel loading"
          role="status"
        >
          <Loader2 className="spin" size={24} aria-hidden="true" />
          <div>
            <strong>회원 목록을 불러오는 중입니다.</strong>
            <p>API-001 응답을 확인하고 있습니다.</p>
          </div>
        </section>
      ) : null}

      {screenState === "error" ? (
        <section className="admin-state-panel error" role="alert">
          <AlertCircle size={24} aria-hidden="true" />
          <div>
            <strong>회원 목록을 불러오지 못했습니다.</strong>
            <p>네트워크 상태를 확인한 후 다시 시도해 주세요.</p>
            <button className="ghost-button compact" onClick={handleRetry} type="button">
              <RefreshCw size={16} aria-hidden="true" />
              다시 시도
            </button>
          </div>
        </section>
      ) : null}

      {screenState === "empty" ? (
        <section className="admin-state-panel empty">
          <FolderOpen size={24} aria-hidden="true" />
          <div>
            <strong>검색 결과가 없습니다.</strong>
            <p>다른 이름, 이메일, ID로 다시 검색해 보세요.</p>
          </div>
        </section>
      ) : null}

      {screenState === "default" ? (
        <section className="admin-users-table-panel" aria-labelledby="scr-014-list-title">
          <div className="admin-users-table-heading">
            <div>
              <p className="eyebrow">API-001</p>
              <h3 id="scr-014-list-title">회원 목록</h3>
            </div>
            <span className="admin-users-count">{visibleUsers.length}명</span>
          </div>
          <div className="admin-users-table-wrap">
            <table className="admin-users-table" data-field="userList" data-testid="scr-014-fld-02">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>이메일</th>
                  <th>가입일</th>
                  <th>최근 활동</th>
                  <th>등급</th>
                  <th data-field="status" data-testid="scr-014-fld-03">
                    상태
                  </th>
                  <th className="text-right" data-field="actions" data-testid="scr-014-fld-04">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-user-cell">
                        <span className="admin-user-avatar" aria-hidden="true">
                          {getAdminUserInitials(user.name)}
                        </span>
                        <div>
                          <strong>{user.name}</strong>
                          <span>#{user.id}</span>
                        </div>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.joinedAt}</td>
                    <td>{user.lastActive}</td>
                    <td>
                      <span className="user-tier-pill">{membershipTierLabels[user.tier]}</span>
                    </td>
                    <td>
                      <span className={`user-status-pill ${getAdminUserStatusClass(user.status)}`}>
                        {user.status}
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          className="ghost-button compact"
                          data-testid="scr-014-act-02"
                          onClick={() => setSelectedUser(user)}
                          type="button"
                        >
                          <Eye size={15} aria-hidden="true" />
                          상세
                        </button>
                        <label className="status-select-label">
                          <span className="sr-only">{user.name} 상태 변경</span>
                          <select
                            aria-label={`${user.name} 상태 변경`}
                            data-testid="scr-014-act-03"
                            onChange={(event) =>
                              handleStatusChange(user.id, event.target.value as AdminUserStatus)
                            }
                            value={user.status}
                          >
                            {adminUserStatusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="status-select-label">
                          <span className="sr-only">{user.name} 등급 변경</span>
                          <select
                            aria-label={`${user.name} 등급 변경`}
                            onChange={(event) =>
                              handleTierChange(
                                user.id,
                                event.target.value as AdminUserMembershipTier,
                              )
                            }
                            value={user.tier}
                          >
                            {adminUserTierOptions.map((tier) => (
                              <option key={tier} value={tier}>
                                {membershipTierLabels[tier]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="admin-state-preview" aria-label="SCR-014 상태 미리보기">
        <span>상태 미리보기</span>
        {adminUserStateOptions.map((state) => (
          <button
            aria-pressed={screenState === state}
            key={state}
            onClick={() => handlePreviewState(state)}
            type="button"
          >
            {state}
          </button>
        ))}
      </div>

      {toastMessage ? (
        <div className="admin-toast" role="status">
          <CheckCircle2 size={17} aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      ) : null}

      {selectedUser ? (
        <div className="admin-modal-backdrop">
          <section
            aria-labelledby="scr-014-detail-title"
            aria-modal="true"
            className="admin-modal"
            role="dialog"
          >
            <div className="admin-modal-header">
              <div>
                <p className="eyebrow">API-001</p>
                <h2 id="scr-014-detail-title">회원 상세</h2>
              </div>
              <button
                aria-label="회원 상세 닫기"
                className="icon-button"
                onClick={() => setSelectedUser(null)}
                type="button"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <p className="admin-modal-summary">
              {selectedUser.name} 님의 상세 정보와 활동 이력을 조회했습니다.
            </p>
            <dl className="admin-detail-grid">
              <div>
                <dt>이메일</dt>
                <dd>{selectedUser.email}</dd>
              </div>
              <div>
                <dt>가입일</dt>
                <dd>{selectedUser.joinedAt}</dd>
              </div>
              <div>
                <dt>최근 활동</dt>
                <dd>{selectedUser.lastActive}</dd>
              </div>
              <div>
                <dt>상태</dt>
                <dd>{selectedUser.status}</dd>
              </div>
            </dl>
            <div className="admin-modal-actions">
              <button className="primary-button" onClick={() => setSelectedUser(null)} type="button">
                닫기
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="placeholder-page" aria-labelledby="placeholder-title">
      <ShieldCheck size={30} aria-hidden="true" />
      <div>
        <p className="eyebrow">Admin Shell</p>
        <h2 id="placeholder-title">{title}</h2>
        <p>공통 관리자 셸과 접근 제어가 적용된 화면입니다.</p>
      </div>
    </section>
  );
}

function PageLoading() {
  return (
    <main className="loading-screen" aria-live="polite">
      관리자 접근 권한을 확인하고 있습니다.
    </main>
  );
}

function AuthModal() {
  const { pendingAction, closeAuthModal, login } = usePublicAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login(email);
  };

  return (
    <div className="public-modal-backdrop">
      <section
        aria-labelledby="auth-modal-title"
        aria-modal="true"
        className="public-auth-modal"
        role="dialog"
      >
        <div className="public-modal-header">
          <span className="public-modal-icon" aria-hidden="true">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2 id="auth-modal-title">로그인이 필요합니다</h2>
            <p>계속하면 요청한 작업으로 바로 돌아갑니다.</p>
          </div>
          <button
            aria-label="로그인 모달 닫기"
            className="public-icon-button"
            onClick={closeAuthModal}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="public-pending-action">
          <span>보호된 작업</span>
          <strong>{pendingAction?.label}</strong>
        </div>

        <form className="public-auth-form" onSubmit={handleSubmit}>
          <label>
            이메일
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="doctor@aiga.test"
              type="email"
              value={email}
            />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              type="password"
              value={password}
            />
          </label>
          <button className="public-primary-button" type="submit">
            <LogIn size={18} aria-hidden="true" />
            로그인
          </button>
        </form>
      </section>
    </div>
  );
}

type LoginScreenState = "default" | "empty" | "loading" | "error" | "permission";

const loginScreenStates: LoginScreenState[] = [
  "default",
  "empty",
  "loading",
  "error",
  "permission",
];

function getForcedLoginState(): LoginScreenState | null {
  const requestedState = new URLSearchParams(window.location.search).get("state");

  if (loginScreenStates.includes(requestedState as LoginScreenState)) {
    return requestedState as LoginScreenState;
  }

  return null;
}

function getLoginReturnPath() {
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");

  if (returnTo?.startsWith("/") && !returnTo.startsWith("/login")) {
    return returnTo;
  }

  return "/my";
}

function PublicLoginPage() {
  const { user, login, logout } = usePublicAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [screenState, setScreenState] = useState<LoginScreenState>(
    () => getForcedLoginState() ?? "default",
  );
  const completionTimer = useRef<number | null>(null);
  const isLoading = screenState === "loading";
  const showsPermissionState = Boolean(user) || screenState === "permission";

  useEffect(
    () => () => {
      if (completionTimer.current !== null) {
        window.clearTimeout(completionTimer.current);
      }
    },
    [],
  );

  const finishLogin = useCallback(
    (identity: string) => {
      login(identity);
      navigate(getLoginReturnPath());
    },
    [login],
  );

  const startLogin = useCallback(
    (identity: string, credential: string) => {
      if (completionTimer.current !== null) {
        window.clearTimeout(completionTimer.current);
      }

      setScreenState("loading");
      completionTimer.current = window.setTimeout(() => {
        completionTimer.current = null;

        if (!identity.includes("@") || credential.trim().toLowerCase() === "wrong") {
          setScreenState("error");
          return;
        }

        finishLogin(identity);
      }, 180);
    },
    [finishLogin],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setScreenState("empty");
      return;
    }

    startLogin(email.trim(), password);
  };

  const handleSocialLogin = (provider: string) => {
    setSelectedProvider(provider);
    startLogin(`${provider}@aiga.test`, "social");
  };

  const resetFormState = () => {
    setScreenState("default");
    setSelectedProvider("");
  };

  const stateCopy: Record<
    Exclude<LoginScreenState, "default" | "permission">,
    { message: string; title: string; tone: string }
  > = {
    empty: {
      message: "이메일과 비밀번호를 입력해 주세요.",
      title: "입력 대기",
      tone: "notice",
    },
    error: {
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      title: "로그인 실패",
      tone: "error",
    },
    loading: {
      message: "로그인 처리 중입니다.",
      title: "인증 확인",
      tone: "loading",
    },
  };
  const activeStateCopy =
    screenState === "default" || screenState === "permission" ? null : stateCopy[screenState];

  if (showsPermissionState) {
    return (
      <main className="public-login-screen">
        <section className="public-login-panel permission" data-screen="SCR-002">
          <button
            aria-label="뒤로"
            className="public-login-back"
            onClick={() => navigate("/")}
            type="button"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div className="public-login-state-card">
            <ShieldCheck size={30} aria-hidden="true" />
            <p className="public-login-kicker">권한 상태</p>
            <h1>이미 로그인되어 있습니다</h1>
            <p>
              {user?.email ?? "로그인된 계정"} 계정으로 보호된 작업을 계속할 수
              있습니다.
            </p>
            <div className="public-login-state-actions">
              <button
                className="public-primary-button"
                onClick={() => navigate(getLoginReturnPath())}
                type="button"
              >
                <UserRound size={17} aria-hidden="true" />
                마이페이지로 이동
              </button>
              {user ? (
                <button className="public-ghost-button" onClick={logout} type="button">
                  <LogOut size={17} aria-hidden="true" />
                  다른 계정으로 로그인
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="public-login-screen">
      <section className="public-login-panel" data-screen="SCR-002">
        <header className="public-login-header">
          <button
            aria-label="뒤로"
            className="public-login-back"
            onClick={() => navigate("/")}
            type="button"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <strong>로그인</strong>
        </header>

        <div className="public-login-intro">
          <span className="public-login-mark" aria-hidden="true">
            A
          </span>
          <h1>AIGA에 오신 것을 환영합니다</h1>
          <p>이메일 또는 소셜 계정으로 로그인하세요</p>
        </div>

        {activeStateCopy ? (
          <div
            className={`public-login-alert ${activeStateCopy.tone}`}
            data-testid="scr-002-error"
            role="alert"
          >
            {screenState === "loading" ? (
              <Loader2 size={18} aria-hidden="true" />
            ) : (
              <AlertCircle size={18} aria-hidden="true" />
            )}
            <div>
              <strong>{activeStateCopy.title}</strong>
              <span>{activeStateCopy.message}</span>
            </div>
            {screenState === "error" ? (
              <button className="public-login-alert-action" onClick={resetFormState} type="button">
                다시 입력
              </button>
            ) : null}
          </div>
        ) : null}

        <form className="public-login-form" data-action="login" noValidate onSubmit={handleSubmit}>
          <label>
            <span>이메일</span>
            <div className="public-login-input">
              <Mail size={17} aria-hidden="true" />
              <input
                autoComplete="email"
                data-field="email"
                data-testid="scr-002-fld-01"
                inputMode="email"
                name="email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (screenState === "empty" || screenState === "error") {
                    setScreenState("default");
                  }
                }}
                placeholder="you@example.com"
                type="email"
                value={email}
              />
            </div>
          </label>

          <label>
            <span>비밀번호</span>
            <div className="public-login-input with-action">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                autoComplete="current-password"
                data-field="password"
                data-testid="scr-002-fld-02"
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (screenState === "empty" || screenState === "error") {
                    setScreenState("default");
                  }
                }}
                placeholder="비밀번호 입력"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                className="public-login-toggle"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff size={17} aria-hidden="true" />
                ) : (
                  <Eye size={17} aria-hidden="true" />
                )}
              </button>
            </div>
          </label>

          <div data-field="loginButton" data-testid="scr-002-fld-04">
            <button
              className="public-primary-button public-login-submit"
              data-testid="scr-002-act-01"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? (
                <Loader2 size={17} aria-hidden="true" />
              ) : (
                <LogIn size={17} aria-hidden="true" />
              )}
              로그인
            </button>
          </div>
        </form>

        <div className="public-login-divider">
          <span>또는</span>
        </div>

        <div className="public-social-stack" data-field="socialLogin" data-testid="scr-002-fld-03">
          {[
            { id: "kakao", label: "카카오로 시작하기", marker: "K" },
            { id: "naver", label: "네이버로 시작하기", marker: "N" },
            { id: "google", label: "구글로 시작하기", marker: "G" },
          ].map((provider) => (
            <button
              aria-pressed={selectedProvider === provider.id}
              className={`public-social-button ${provider.id}`}
              data-provider={provider.id}
              data-testid="scr-002-act-02"
              disabled={isLoading}
              key={provider.id}
              onClick={() => handleSocialLogin(provider.id)}
              type="button"
            >
              <span aria-hidden="true">{provider.marker}</span>
              {provider.label}
            </button>
          ))}
        </div>

        <p className="public-login-signup">
          아직 회원이 아니신가요?
          <PublicLink className="public-login-signup-link" href="/signup">
            회원가입
          </PublicLink>
        </p>
      </section>
    </main>
  );
}

function PublicLink({
  href,
  children,
  className,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <a
      aria-label={ariaLabel}
      className={className}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

function CommunityPostDetailRoute({ postId }: { postId: string }) {
  return <PostDetailPage postId={postId} />;
}

function PublicShell({ route }: { route: PublicRoute }) {
  const { user, logout } = usePublicAuth();

  if (route.view === "login") {
    return <PublicLoginPage />;
  }

  return (
    <div className="public-shell">
      <header className="public-topbar">
        <PublicLink ariaLabel="AIGA 홈" className="public-brand" href="/">
          <img className="aiga-wordmark" src="/aiga-wordmark.svg" alt="AIGA" height={20} width={76} />
        </PublicLink>
        <nav className="public-nav" aria-label="주요 메뉴">
          <PublicLink href="/">홈</PublicLink>
          <PublicLink href="/browse">브라우즈</PublicLink>
          <PublicLink href="/search">검색</PublicLink>
          <PublicLink href="/items">목록</PublicLink>
          <PublicLink href="/community">커뮤니티</PublicLink>
          <PublicLink href="/doctor-verification">의사 인증</PublicLink>
          <PublicLink href="/my">마이페이지</PublicLink>
        </nav>
        <div className="public-header-actions">
          {user ? (
            <>
              <span className="public-tier-badge" aria-label="현재 회원 등급">
                {membershipTierLabels[user.tier]}
              </span>
              <button className="public-ghost-button" onClick={logout} type="button">
                로그아웃
              </button>
            </>
          ) : (
            <>
              <PublicLink className="public-ghost-button" href="/signup">
                회원가입
              </PublicLink>
              <button
                aria-label="로그인 후 마이페이지"
                className="public-primary-button"
                onClick={() => navigate("/login")}
                type="button"
              >
                로그인
              </button>
            </>
          )}
        </div>
        <button
          className="public-header-search"
          onClick={() => navigate("/search")}
          type="button"
          aria-label="검색"
        >
          <Search size={20} aria-hidden="true" />
        </button>
      </header>

      <main>
        {route.view === "home" ? <HomePage /> : null}
        {route.view === "browse" ? <BrowsePage /> : null}
        {route.view === "search" ? <SearchPage /> : null}
        {route.view === "items" ? <ItemsPage /> : null}
        {route.view === "community" ? <CommunityPage /> : null}
        {route.view === "postDetail" ? (
          <CommunityPostDetailRoute postId={route.postId || ""} />
        ) : null}
        {route.view === "itemDetail" ? <ItemDetailPage itemId={route.itemId || ""} /> : null}
        {route.view === "itemEditor" ? <ContentEditorPage /> : null}
        {route.view === "signup" ? <SignupPage /> : null}
        {route.view === "doctorVerification" ? (
          <ProtectedPublicRoute actionLabel="의사 인증 신청" route={route}>
            <DoctorVerificationPage />
          </ProtectedPublicRoute>
        ) : null}
        {route.view === "write" ? (
          <ProtectedPublicRoute actionLabel="게시글 작성" route={route}>
            <WritePage />
          </ProtectedPublicRoute>
        ) : null}
        {route.view === "mypage" ? (
          <ProtectedPublicRoute actionLabel="마이페이지 보기" route={route}>
            <MyPage />
          </ProtectedPublicRoute>
        ) : null}
        {route.view === "notFound" ? <NotFoundPage /> : null}
      </main>
    </div>
  );
}

function ProtectedPublicRoute({
  actionLabel,
  children,
  route,
}: {
  actionLabel: string;
  children: ReactNode;
  route: PublicRoute;
}) {
  const { user, requestAuth } = usePublicAuth();

  useEffect(() => {
    if (!user) {
      requestAuth(actionLabel, () => navigate(route.path));
    }
  }, [actionLabel, requestAuth, route.path, user]);

  if (!user) {
    return (
      <section className="public-route-guard">
        <ShieldCheck size={28} aria-hidden="true" />
        <h1>로그인이 필요한 화면</h1>
        <p>{actionLabel} 요청을 이어가려면 로그인하세요.</p>
      </section>
    );
  }

  return children;
}

function HomePage() {
  const { user, requestAuth } = usePublicAuth();
  const [screenState, setScreenState] = useState<HomeState>("default");
  const [activeTab, setActiveTab] = useState(bestDoctorTabs[0]);
  const [selectionMessage, setSelectionMessage] = useState("");

  const showDefaultState = () => {
    setScreenState("default");
    setSelectionMessage("");
  };

  const requestSignup = () => {
    requestAuth("AI 의사찾기 가입", () => {
      setScreenState("default");
      setSelectionMessage("AI 의사찾기를 이용할 수 있습니다.");
    });
  };

  const selectPrimaryAction = (doctorName: string) => {
    if (!user) {
      setScreenState("permission");
      setSelectionMessage("");
      return;
    }

    setSelectionMessage(`${doctorName} 프로필을 열었습니다.`);
  };

  const selectRecommendedItem = (title: string) => {
    setSelectionMessage(`${title} 추천 항목을 열었습니다.`);
  };

  return (
    <section
      className="scr-home-screen"
      data-device="mobile"
      data-screen="SCR-001"
      id="SCR-001"
    >
      <div className="scr-home-statebar" aria-label="홈 화면 상태">
        <span>상태:</span>
        {homeStateOptions.map((option) => (
          <button
            aria-pressed={screenState === option.value}
            className={screenState === option.value ? "scr-state-button active" : "scr-state-button"}
            data-state-btn={option.value}
            key={option.value}
            onClick={() => {
              setScreenState(option.value);
              setSelectionMessage("");
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="scr-home-body">
        {screenState === "loading" ? <HomeLoadingState /> : null}
        {screenState === "error" ? <HomeErrorState onReload={showDefaultState} /> : null}
        {screenState === "permission" ? <HomePermissionState onSignup={requestSignup} /> : null}
        {screenState === "empty" ? <HomeEmptyState onReload={showDefaultState} /> : null}
        {screenState === "default" ? (
          <HomeDefaultState
            activeTab={activeTab}
            onPrimaryAction={selectPrimaryAction}
            onRecommendedAction={selectRecommendedItem}
            onRequestSignup={requestSignup}
            onTabChange={setActiveTab}
            selectionMessage={selectionMessage}
          />
        ) : null}
      </div>

      <nav className="scr-home-bottom-nav" aria-label="하단 메뉴">
        <button className="active" data-nav="SCR-001" onClick={() => navigate("/")} type="button">
          <House size={22} aria-hidden="true" />
          <span>홈</span>
        </button>
        <button data-nav="SCR-004" onClick={() => navigate("/search")} type="button">
          <Bot size={22} aria-hidden="true" />
          <span>AI 의사찾기</span>
        </button>
        <button data-nav="SCR-005" onClick={() => navigate("/items")} type="button">
          <Stethoscope size={22} aria-hidden="true" />
          <span>의사 검색</span>
        </button>
        <button data-nav="SCR-007" onClick={() => navigate("/community")} type="button">
          <MessageCircle size={22} aria-hidden="true" />
          <span>커뮤니티</span>
        </button>
        <button data-nav="SCR-010" onClick={() => navigate("/my")} type="button">
          <UserRound size={22} aria-hidden="true" />
          <span>MY</span>
        </button>
      </nav>
    </section>
  );
}

function HomeDefaultState({
  activeTab,
  onPrimaryAction,
  onRecommendedAction,
  onRequestSignup,
  onTabChange,
  selectionMessage,
}: {
  activeTab: string;
  onPrimaryAction: (doctorName: string) => void;
  onRecommendedAction: (title: string) => void;
  onRequestSignup: () => void;
  onTabChange: (tab: string) => void;
  selectionMessage: string;
}) {
  return (
    <div className="scr-home-default" data-state="default">
      <div className="scr-home-alert">
        <AlertCircle size={19} aria-hidden="true" />
        <div>
          <strong>오늘 명의 프로필 조회를 모두 사용했어요. (3회 / 일)</strong>
          <span>내일 자정에 초기화돼요</span>
        </div>
        <button className="scr-home-warning-button" onClick={onRequestSignup} type="button">
          <UserPlus size={16} aria-hidden="true" />
          지금 가입하면 바로 이용 가능
        </button>
      </div>

      <section className="scr-home-banner" data-field="banner" data-testid="scr-001-fld-01">
        <img className="scr-home-logo" src="/aiga-hero-logo.png" width={120} height={120} alt="AIGA" />
        <div className="scr-home-greeting">
          <span>안녕하세요.</span>
          <h1>어디가 아프세요?</h1>
        </div>
        <div className="scr-home-search">
          <input aria-label="증상 검색" placeholder="폐암 수술 잘 하는 의사 찾아줘." type="search" />
          <button className="scr-home-search-btn" type="button" aria-label="검색 보내기">
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="scr-home-hint">AI의사찾기는 회원 전용입니다</p>
      </section>

      <section
        className="scr-home-section"
        data-field="primaryActions"
        data-testid="scr-001-fld-02"
      >
        <h2>환자ㆍ의사ㆍAI가 뽑은 베스트 닥터</h2>
        <div className="scr-home-tabs" role="group" aria-label="진료 카테고리">
          {bestDoctorTabs.map((tab) => (
            <button
              aria-pressed={activeTab === tab}
              className={activeTab === tab ? "active" : ""}
              key={tab}
              onClick={() => onTabChange(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
        <ul className="scr-doctor-list">
          {bestDoctors.map((doctor, index) => (
            <li key={doctor.rank}>
              <button
                aria-label={`주요 액션 선택: ${doctor.name}`}
                data-action="scr-001-act-01"
                data-testid={index === 0 ? "scr-001-act-01" : undefined}
                onClick={() => onPrimaryAction(doctor.name)}
                type="button"
              >
                <span className="scr-doctor-info">
                  <span className="scr-doctor-name-row">
                    <strong className="scr-doctor-name">{doctor.name}</strong>
                    <span className="scr-rank-indicator" aria-label={`순위 ${doctor.rank}`}>
                      <TrendingUp size={10} aria-hidden="true" />
                      {doctor.rank}
                    </span>
                    {doctor.verified ? <em className="scr-verified-badge">의사 인증</em> : null}
                  </span>
                  <span className="scr-doctor-detail">
                    <span className="scr-doctor-hospital">{doctor.hospital}</span>
                    <span className="scr-dot" aria-hidden="true">•</span>
                    <span className="scr-doctor-dept">{doctor.department}</span>
                  </span>
                </span>
                <span className="scr-doctor-avatar" aria-hidden="true">
                  {doctor.name.slice(0, 1)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button className="scr-home-outline-button" onClick={() => navigate("/items")} type="button">
          더 보기
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <p className="scr-home-note">
          순위는 환자경험, 의사추천, AI 스코어링 등을 토대로 산출됩니다.
        </p>
      </section>

      <section
        className="scr-home-section"
        data-field="recommendedItems"
        data-testid="scr-001-fld-03"
      >
        <h2>의사 선생님, 감사해요</h2>
        <div className="scr-story-rail">
          {appreciationStories.map((story, index) => (
            <button
              aria-label={`추천 항목 선택: ${story.title} 후기`}
              className="scr-story-card"
              data-action="scr-001-act-02"
              data-testid={index === 0 ? "scr-001-act-02" : undefined}
              key={story.title}
              onClick={() => onRecommendedAction(story.title)}
              type="button"
            >
              <span className="scr-story-media">
                <span>후기</span>
                <Video size={28} aria-hidden="true" />
              </span>
              <strong>{story.title}</strong>
              <span>{story.summary}</span>
              <small>
                {story.hospital} · {story.doctor}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="scr-home-section">
        <h2>커뮤니티 추천 글</h2>
        <div className="scr-community-list">
          {communityRecommendations.map((post) => (
            <button
              className="scr-community-card"
              data-action="scr-001-act-02"
              key={post.title}
              onClick={() => onRecommendedAction(post.title)}
              type="button"
            >
              <span className="scr-community-stats">
                <span>
                  <Heart size={14} aria-hidden="true" />
                  {post.likes}
                </span>
                <span>
                  <MessageCircle size={14} aria-hidden="true" />
                  {post.comments}
                </span>
              </span>
              <strong>{post.title}</strong>
              <span>{post.summary}</span>
              <small>
                {post.author} · {post.time}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="scr-home-highlights" data-field="highlights" data-testid="scr-001-fld-04">
        <HomeHighlightList icon={<Newspaper size={18} />} items={homeNews} title="K-베스트닥터 뉴스" />
        <HomeHighlightList icon={<BookOpen size={18} />} items={healthContents} title="건강 콘텐츠" />
      </section>

      <ReviewRatingSection />

      {selectionMessage ? (
        <p className="scr-home-selection" aria-live="polite">
          {selectionMessage}
        </p>
      ) : null}
    </div>
  );
}

function HomeHighlightList({
  icon,
  items,
  title,
}: {
  icon: ReactNode;
  items: Array<{ title: string; date: string }>;
  title: string;
}) {
  return (
    <div className="scr-highlight-list">
      <h2>
        <span aria-hidden="true">{icon}</span>
        {title}
      </h2>
      <ul>
        {items.map((item) => (
          <li key={`${title}-${item.title}`}>
            <button type="button">
              <span>{item.title}</span>
              <time>{item.date}</time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HomeLoadingState() {
  return (
    <div className="scr-home-skeletons" data-state="loading" aria-live="polite">
      <div className="scr-skeleton hero" />
      <div className="scr-skeleton title" />
      <div className="scr-skeleton-row">
        <div className="scr-skeleton chip" />
        <div className="scr-skeleton chip" />
        <div className="scr-skeleton chip" />
      </div>
      <div className="scr-skeleton card" />
      <div className="scr-skeleton card" />
    </div>
  );
}

function HomeErrorState({ onReload }: { onReload: () => void }) {
  return (
    <div className="scr-home-status-panel error" data-state="error">
      <AlertCircle size={48} aria-hidden="true" />
      <div>
        <h1>일시적인 문제가 발생했어요.</h1>
        <p>잠시 후 다시 시도해 주세요.</p>
      </div>
      <button className="scr-home-primary-button" onClick={onReload} type="button">
        <RefreshCw size={17} aria-hidden="true" />
        새로 고침
      </button>
    </div>
  );
}

function HomePermissionState({ onSignup }: { onSignup: () => void }) {
  return (
    <div className="scr-home-status-panel permission" data-state="permission">
      <LockKeyhole size={48} aria-hidden="true" />
      <div>
        <h1>AI 의사찾기는 회원 전용입니다</h1>
        <p>가입하면 주요 기능을 모두 이용할 수 있어요.</p>
      </div>
      <button className="scr-home-primary-button" onClick={onSignup} type="button">
        <UserPlus size={17} aria-hidden="true" />
        가입하기
      </button>
    </div>
  );
}

function HomeEmptyState({ onReload }: { onReload: () => void }) {
  return (
    <div className="scr-home-status-panel empty" data-state="empty">
      <FolderOpen size={48} aria-hidden="true" />
      <div>
        <h1>아직 표시할 콘텐츠가 없어요</h1>
        <p>추천 콘텐츠가 준비되면 여기에 표시됩니다.</p>
      </div>
      <button className="scr-home-outline-button wide" onClick={onReload} type="button">
        <RefreshCw size={17} aria-hidden="true" />
        새로 고침
      </button>
    </div>
  );
}

function BrowsePage() {
  return (
    <>
      <section className="public-page-header">
        <span className="public-eyebrow">
          <Search size={16} aria-hidden="true" />
          Public browse
        </span>
        <h1>브라우즈</h1>
        <p>로그인하지 않아도 콘텐츠 목록, 요약, 참여 정보를 확인할 수 있습니다.</p>
      </section>
      <BrowseSection />
    </>
  );
}

function BrowseSection() {
  return (
    <section className="public-content-band" aria-labelledby="browse-title">
      <div className="public-section-title">
        <div>
          <h2 id="browse-title">콘텐츠 둘러보기</h2>
          <p>저장과 시작은 보호 액션으로 인증 후 이어집니다.</p>
        </div>
        <label className="public-search-box">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">검색</span>
          <input placeholder="콘텐츠 검색" type="search" />
        </label>
      </div>

      <div className="public-content-grid">
        {browseContentItems.map((item) => (
          <ContentCard item={item} key={item.title} />
        ))}
      </div>

      <MembershipTierSummary />
    </section>
  );
}

function MembershipTierSummary() {
  const tiers: Array<{
    tier: AudienceTier;
    description: string;
  }> = [
    {
      tier: "guest",
      description: "콘텐츠 목록과 공개 커뮤니티 흐름을 둘러볼 수 있습니다.",
    },
    {
      tier: "member",
      description: "저장, 글쓰기, 마이페이지 같은 개인 기능을 사용할 수 있습니다.",
    },
    {
      tier: "verified_doctor",
      description: "면허 인증 커뮤니티와 전문가 전용 권한을 사용할 수 있습니다.",
    },
  ];

  return (
    <section className="membership-tier-summary" aria-label="회원 등급별 권한">
      {tiers.map((tier) => (
        <article className="membership-tier-card" key={tier.tier}>
          <strong>{membershipTierLabels[tier.tier]}</strong>
          <span>{tier.description}</span>
        </article>
      ))}
    </section>
  );
}

function LegacySimpleItemsPage() {
  return <ItemsPage />;
}

function ItemDetailPage({ itemId }: { itemId: string }) {
  const { requestAuth } = usePublicAuth();
  const forcedState = getForcedItemDetailState();
  const routeKey = `${itemId}:${window.location.search}`;
  const routeState =
    forcedState ??
    (itemId === "error"
      ? "error"
      : itemId === "private"
        ? "permission"
        : itemDetails[itemId]
          ? "default"
          : "empty");
  const [manualState, setManualState] = useState<{
    key: string;
    value: ItemDetailState;
  } | null>(null);
  const state = manualState?.key === routeKey ? manualState.value : routeState;
  const [status, setStatus] = useState("");
  const detail = itemDetails[itemId] ?? itemDetails["content-lung-checklist"];

  if (state === "loading") {
    return (
      <section
        aria-label="상세 정보를 불러오는 중"
        className="public-route-guard"
        data-state="loading"
        role="status"
      >
        상세 정보를 불러오는 중
      </section>
    );
  }

  if (state === "empty") {
    return (
      <section className="public-route-guard" data-state="empty">
        <p>표시할 상세 정보가 없어요.</p>
        <button className="public-ghost-button" onClick={() => navigate("/items")} type="button">
          목록으로 돌아가기
        </button>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section className="public-route-guard" data-state="error">
        <p>일시적인 문제가 발생했어요.</p>
        <button
          className="public-primary-button"
          data-testid="scr-006-retry"
          onClick={() => setManualState({ key: routeKey, value: "default" })}
          type="button"
        >
          <RefreshCw size={17} aria-hidden="true" />
          새로 고침
        </button>
      </section>
    );
  }

  if (state === "permission") {
    return (
      <section className="public-route-guard" data-state="permission">
        <ShieldCheck size={28} aria-hidden="true" />
        <p>접근 권한이 없어요.</p>
        <button className="public-ghost-button" onClick={() => navigate("/items")} type="button">
          이전으로
        </button>
      </section>
    );
  }

  return (
    <section
      className="item-detail-screen"
      aria-labelledby="item-detail-title"
      data-screen="SCR-006"
      data-state="default"
      id="SCR-006"
    >
      <button className="item-detail-back" onClick={() => navigate("/items")} type="button">
        <ArrowLeft size={18} aria-hidden="true" />
        <span>상세</span>
      </button>
      <header className="public-page-header compact" data-field="detail" data-testid="scr-006-fld-01">
        <span className="public-eyebrow">
          <FolderOpen size={16} aria-hidden="true" />
          SCR-006
        </span>
        <h1 id="item-detail-title">{detail.title}</h1>
        <p>{detail.summary}</p>
      </header>

      <div className="public-dashboard-grid" data-field="metadata" data-testid="scr-006-fld-03">
        <article className="public-metric-card"><strong>{detail.status}</strong><span>상태</span></article>
        <article className="public-metric-card"><strong>{detail.category}</strong><span>카테고리</span></article>
        <article className="public-metric-card"><strong>{detail.conditionTags[0] ?? "-"}</strong><span>질환 태그</span></article>
      </div>

      <article className="public-content-card">
        <div className="public-card-topline">
          <span>{contentCategoryLabels[detail.category]}</span>
          <span>{detail.updatedAt}</span>
        </div>
        <p>{detail.body}</p>
      </article>

      <div className="public-card-actions" data-field="relatedActions" data-testid="scr-006-fld-02">
        <button
          aria-label="주요 액션"
          className="public-primary-button"
          data-testid="scr-006-act-01"
          onClick={() => requestAuth("주요 액션 선택", () => setStatus("주요 액션 완료"))}
          type="button"
        >
          <PlayCircle size={17} aria-hidden="true" />
          주요 액션
        </button>
        {detail.relatedItems.map((related, index) => (
          <button
            className="public-ghost-button"
            data-related-id={related.id}
            data-testid={index === 0 ? "scr-006-act-02" : undefined}
            key={related.id}
            onClick={() => setStatus(`${related.title} 선택 완료`)}
            type="button"
          >
            <Link2 size={16} aria-hidden="true" />
            {related.title}
          </button>
        ))}
      </div>

      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}

function LegacySimplePostDetailPage({ postId }: { postId: string }) {
  const { requestAuth } = usePublicAuth();
  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState(postDetail.comments);

  if (postId === "missing") {
    return <section className="public-route-guard">게시글이 없습니다.</section>;
  }

  if (postId === "loading") {
    return <section aria-label="게시글 로딩" role="status" className="public-route-guard">게시글을 불러오는 중입니다.</section>;
  }

  if (postId === "error") {
    return (
      <section className="public-route-guard">
        <p>게시글을 불러오지 못했습니다.</p>
        <button type="button">다시 시도</button>
      </section>
    );
  }

  if (postId === "private-case") {
    return <section className="public-route-guard">접근 권한이 없습니다.</section>;
  }

  const submitComment = () => {
    const body = draft.trim();

    if (!body) {
      return;
    }

    requestAuth("댓글 작성", () => {
      setComments((current) => [
        ...current,
        {
          id: `comment-${current.length + 1}`,
          author: "나",
          avatarUrl: "https://i.pravatar.cc/64?img=32",
          body,
          age: "방금 전",
        },
      ]);
      setDraft("");
    });
  };

  return (
    <article className="post-detail-screen">
      <header className="public-page-header compact" data-testid="scr-008-fld-01">
        <span className="public-eyebrow">
          <MessageCircle size={16} aria-hidden="true" />
          Post
        </span>
        <h1>{postDetail.title}</h1>
        <p>{postDetail.body}</p>
      </header>
      <section data-testid="scr-008-fld-03">
        <strong>{postDetail.author.name}</strong>
        <button aria-label={`${postDetail.author.name} 작성자 프로필 보기`} data-testid="scr-008-act-02" type="button">
          프로필
        </button>
      </section>
      <div className="public-card-actions">
        <button aria-label="신고하기" data-testid="scr-008-act-03" type="button">신고하기</button>
        <button aria-label="공유하기" data-testid="scr-008-act-04" type="button">공유하기</button>
      </div>
      <section data-testid="scr-008-fld-02">
        <h2>댓글 {comments.length}</h2>
        {comments.map((comment) => (
          <article key={comment.id}>
            <strong>{comment.author}</strong>
            <p>{comment.body}</p>
          </article>
        ))}
      </section>
      <form
        data-testid="scr-008-act-01"
        onSubmit={(event) => {
          event.preventDefault();
          submitComment();
        }}
      >
        <label>
          댓글 입력
          <textarea onChange={(event) => setDraft(event.target.value)} value={draft} />
        </label>
        <button type="submit">댓글 등록</button>
      </form>
    </article>
  );
}

const LegacyPostDetailPage = LegacySimplePostDetailPage;

function ItemsPage() {
  const [activeCategory, setActiveCategory] = useState<ContentCategory>("free");
  const [sort, setSort] = useState<ItemsSort>("newest");
  const [screenState, setScreenState] = useState<ItemsScreenState>(getInitialItemsState);

  const sortedItems = useMemo(() => {
    const filtered = contentItems.filter(
      (item) => item.status === "published" && item.category === activeCategory,
    );

    return [...filtered].sort((left, right) => {
      if (sort === "popular") {
        return right.viewCount - left.viewCount;
      }

      if (sort === "title") {
        return right.title.localeCompare(left.title, "ko");
      }

      return right.publishedAt.localeCompare(left.publishedAt);
    });
  }, [activeCategory, sort]);

  const resolvedState =
    screenState === "default" && sortedItems.length === 0 ? "empty" : screenState;
  const total = sortedItems.length;

  const resetToDefault = () => {
    setActiveCategory("free");
    setSort("newest");
    setScreenState("default");
    window.history.replaceState({}, "", "/items");
  };

  const selectCategory = (category: ContentCategory) => {
    setActiveCategory(category);
    setScreenState("default");
  };

  return (
    <section className="scr-items-screen" data-device="mobile" data-screen="SCR-005" id="SCR-005">
      <header className="scr-items-header">
        <div>
          <span className="public-eyebrow">
            <List size={16} aria-hidden="true" />
            SCR-005
          </span>
          <h1>목록</h1>
        </div>
        <PublicLink ariaLabel="검색으로 이동" className="scr-items-icon-link" href="/search">
          <Search size={18} aria-hidden="true" />
        </PublicLink>
      </header>

      <div className="scr-items-sticky">
        <div className="scr-items-category" data-field="category" data-testid="scr-005-fld-01">
          <div className="scr-items-tabs" role="tablist" aria-label="카테고리">
            {contentCategoryOptions.map((category) => (
              <button
                aria-selected={activeCategory === category.value}
                className={activeCategory === category.value ? "active" : ""}
                data-action="ACT-01"
                data-category={category.value}
                data-testid="scr-005-act-01"
                key={category.value}
                onClick={() => selectCategory(category.value)}
                role="tab"
                type="button"
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scr-items-toolbar">
          <span>
            총 <strong>{resolvedState === "default" ? total : 0}</strong>건
          </span>
          <div
            className="scr-items-sort"
            data-field="sort"
            data-testid="scr-005-fld-02"
            role="group"
            aria-label="정렬"
          >
            {itemSortOptions.map((option) => (
              <label className={sort === option.value ? "active" : ""} key={option.value}>
                <input
                  aria-label={option.label}
                  checked={sort === option.value}
                  data-action="ACT-02"
                  data-sort={option.value}
                  data-testid="scr-005-act-02"
                  name="items-sort"
                  onChange={() => {
                    setSort(option.value);
                    setScreenState("default");
                  }}
                  type="radio"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="scr-items-content">
        {resolvedState === "loading" ? <ItemsLoadingState /> : null}
        {resolvedState === "permission" ? <ItemsPermissionState /> : null}
        {resolvedState === "error" ? <ItemsErrorState onRetry={resetToDefault} /> : null}
        {resolvedState === "empty" ? <ItemsEmptyState /> : null}
        {resolvedState === "default" ? (
          <>
            <ul
              className="scr-items-list"
              data-field="itemCards"
              data-state="default"
              data-testid="scr-005-fld-03"
            >
              {sortedItems.map((item) => (
                <li key={item.id}>
                  <a
                    data-action="ACT-03"
                    data-nav="SCR-006"
                    data-target="SCR-006"
                    data-testid="scr-005-act-03"
                    href={`/items/${item.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(`/items/${item.id}`);
                    }}
                  >
                    <span className="scr-items-avatar" aria-hidden="true">
                      {contentCategoryLabels[item.category].slice(0, 1)}
                    </span>
                    <span className="scr-items-card-main">
                      <span className="scr-items-card-title">
                        <strong>{item.title}</strong>
                        <span className="scr-items-badge">
                          <CheckCircle2 size={12} aria-hidden="true" />
                          {item.status}
                        </span>
                      </span>
                      <span className="scr-items-hospital">{item.summary}</span>
                      <span className="scr-items-meta">
                        {item.conditionTags.join(", ")}
                        <span aria-hidden="true">·</span>
                        조회 {item.viewCount}
                      </span>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>

            <nav
              className="scr-items-pagination"
              data-field="pagination"
              data-testid="scr-005-fld-04"
              aria-label="페이지네이션"
            >
              <button type="button" aria-label="이전 페이지">
                ‹
              </button>
              <button className="active" type="button" aria-current="page">
                1
              </button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button" aria-label="다음 페이지">
                ›
              </button>
            </nav>
          </>
        ) : null}
      </div>

      <nav className="scr-items-bottom-nav" aria-label="하단 메뉴">
        <PublicLink href="/">
          <House size={18} aria-hidden="true" />
          홈
        </PublicLink>
        <PublicLink href="/search">
          <Search size={18} aria-hidden="true" />
          검색
        </PublicLink>
        <PublicLink className="active" href="/items">
          <List size={18} aria-hidden="true" />
          목록
        </PublicLink>
        <PublicLink href="/community">
          <MessageCircle size={18} aria-hidden="true" />
          커뮤니티
        </PublicLink>
        <PublicLink href="/my">
          <UserRound size={18} aria-hidden="true" />
          마이
        </PublicLink>
      </nav>
    </section>
  );
}

function ItemsLoadingState() {
  return (
    <div className="scr-items-loading" data-state="loading" aria-live="polite">
      {[1, 2, 3].map((row) => (
        <div className="scr-items-skeleton-row" key={row}>
          <span />
          <div>
            <span />
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemsPermissionState() {
  return (
    <div className="scr-items-state-panel" data-state="permission">
      <LockKeyhole size={42} aria-hidden="true" />
      <h2>접근 권한이 필요합니다</h2>
      <p>이 목록을 보려면 권한이 필요합니다.</p>
    </div>
  );
}

function ItemsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="scr-items-state-panel error" data-state="error">
      <AlertCircle size={42} aria-hidden="true" />
      <h2>일시적인 문제가 발생했어요.</h2>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button className="public-ghost-button" onClick={onRetry} type="button">
        <RefreshCw size={17} aria-hidden="true" />
        새로 고침
      </button>
    </div>
  );
}

function ItemsEmptyState() {
  return (
    <div className="scr-items-state-panel" data-state="empty">
      <Search size={42} aria-hidden="true" />
      <h2>검색 결과가 없어요</h2>
      <p>다른 카테고리나 키워드로 검색해보세요.</p>
    </div>
  );
}

function SearchPage() {
  const { user, requestAuth } = usePublicAuth();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("default");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<SearchResultType>("content");
  const [activeFilter, setActiveFilter] = useState<SearchFilter>("all");
  const [guestSearchesRemaining, setGuestSearchesRemaining] = useState(1);
  const [selectionMessage, setSelectionMessage] = useState("");
  const searchTimerRef = useRef<number | null>(null);

  const clearSearchTimer = useCallback(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, []);

  const runSearch = useCallback(
    (
      nextQuery = query,
      nextFilter = activeFilter,
      options: { authorized?: boolean; requiresQuota?: boolean } = {},
    ) => {
      const normalizedQuery = nextQuery.trim();
      clearSearchTimer();
      setSelectionMessage("");

      if (!normalizedQuery) {
        setResults([]);
        setStatus("default");
        setActiveTab("content");
        return;
      }

      setStatus("loading");

      searchTimerRef.current = window.setTimeout(() => {
        if (normalizedQuery.toLowerCase().includes("error")) {
          setResults([]);
          setStatus("error");
          return;
        }

        if (
          !user &&
          !options.authorized &&
          options.requiresQuota &&
          guestSearchesRemaining <= 0
        ) {
          setResults([]);
          setStatus("permission");
          return;
        }

        const nextResults = getSearchMatches(normalizedQuery, nextFilter);

        if (!user && !options.authorized && options.requiresQuota) {
          setGuestSearchesRemaining(0);
        }

        setResults(nextResults);
        setActiveTab(getFirstVisibleSearchTab(nextResults, activeTab));
        setStatus(nextResults.length > 0 ? "results" : "empty");
      }, searchDelayMs);
    },
    [
      activeFilter,
      activeTab,
      clearSearchTimer,
      guestSearchesRemaining,
      query,
      user,
    ],
  );

  useEffect(() => clearSearchTimer, [clearSearchTimer]);

  const resultCounts = useMemo(() => getSearchCounts(results), [results]);
  const visibleResults = useMemo(
    () => results.filter((result) => result.type === activeTab),
    [activeTab, results],
  );

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    runSearch(nextQuery, activeFilter, { requiresQuota: true });
  };

  const handleFilterChange = (nextFilter: SearchFilter) => {
    setActiveFilter(nextFilter);
    runSearch(query, nextFilter, { requiresQuota: false });
  };

  const handleContinueSearch = () => {
    requestAuth("통합 검색 계속 이용", () => {
      setGuestSearchesRemaining(1);
      runSearch(query, activeFilter, { authorized: true, requiresQuota: false });
    });
  };

  return (
    <section className="search-screen" data-screen="SCR-004" id="SCR-004">
      <header className="search-header">
        <span className="public-eyebrow">
          <Search size={16} aria-hidden="true" />
          통합 검색
        </span>
        <h1>통합 검색</h1>
        <p>콘텐츠, 병원, 의사, 커뮤니티 글을 탭별로 찾아봅니다.</p>
      </header>

      <div className="search-panel">
        <div className="search-input-stack">
          <label className="search-input-control" data-testid="scr-004-act-01">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">검색어 입력</span>
            <input
              data-testid="scr-004-fld-01"
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="질환명, 병원명, 의사명 검색"
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="검색어 지우기"
                className="search-clear-button"
                onClick={() => handleQueryChange("")}
                type="button"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </label>

          {!user ? (
            <div className="search-usage-banner">
              <span>
                {guestSearchesRemaining > 0
                  ? "오늘 검색 1회 남았어요."
                  : "가입하면 계속 검색할 수 있어요."}
              </span>
              <button
                className="public-primary-button compact"
                onClick={handleContinueSearch}
                type="button"
              >
                가입하기
              </button>
            </div>
          ) : null}
        </div>

        <div
          className="search-filter-row"
          data-field="filters"
          data-testid="scr-004-fld-04"
        >
          {searchFilters.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.id}
              className={activeFilter === filter.id ? "search-chip active" : "search-chip"}
              data-testid="scr-004-act-03"
              key={filter.id}
              onClick={() => handleFilterChange(filter.id)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>

        {status === "default" ? (
          <div className="search-default-state" id="state-default">
            <div>
              <Stethoscope size={24} aria-hidden="true" />
              <div>
                <h2>증상이 있으신가요?</h2>
              <p>Aiga에게 직접 물어보세요. 콘텐츠, 디렉터리, 커뮤니티 결과를 분리해 보여드려요.</p>
              </div>
            </div>
            <button
              className="public-primary-button"
              onClick={() => requestAuth("Aiga 질문하기", () => navigate("/my"))}
              type="button"
            >
              질문하기
            </button>
          </div>
        ) : null}

        {status === "loading" ? (
          <div className="search-state-message" id="state-loading" role="status">
            <Loader2 className="spin-icon" size={26} aria-hidden="true" />
            <p>검색 중...</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="search-state-message error" id="state-error">
            <AlertCircle size={32} aria-hidden="true" />
            <p>일시적인 문제가 발생했어요.</p>
            <button
              className="public-ghost-button"
              onClick={() => runSearch(query, activeFilter, { requiresQuota: true })}
              type="button"
            >
              <RefreshCw size={16} aria-hidden="true" />
              다시 시도
            </button>
          </div>
        ) : null}

        {status === "permission" ? (
          <div className="search-state-message permission" id="state-permission">
            <LockKeyhole size={32} aria-hidden="true" />
            <p>오늘 검색을 모두 사용했어요.</p>
            <span>가입하면 통합 검색을 계속 이용할 수 있어요.</span>
            <button className="public-primary-button" onClick={handleContinueSearch} type="button">
              가입하고 계속 검색
            </button>
          </div>
        ) : null}

        {status === "empty" ? (
          <div className="search-state-message empty" id="state-empty">
            <Search size={32} aria-hidden="true" />
            <h2>검색 결과가 없습니다</h2>
            <p>질환명, 병원명, 의사 이름이 정확한지 확인해 주세요.</p>
            <button
              className="public-ghost-button"
              onClick={() => requestAuth("Aiga 질문하기", () => navigate("/my"))}
              type="button"
            >
              질문하기
            </button>
          </div>
        ) : null}

        {status === "results" ? (
          <div className="search-results-state" id="state-results">
            <div
              className="search-tabs"
              data-field="resultTabs"
              data-testid="scr-004-fld-02"
              role="tablist"
            >
              {searchTabs.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? "search-tab active" : "search-tab"}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label} ({resultCounts[tab.id]})
                </button>
              ))}
            </div>

            <div
              className="search-result-list"
              data-field="results"
              data-testid="scr-004-fld-03"
            >
              {visibleResults.map((result) => (
                <button
                  className="search-result-card"
                  data-result-type={result.type}
                  data-testid="scr-004-act-02"
                  key={result.id}
                  onClick={() => setSelectionMessage(`${result.title} 결과를 선택했습니다.`)}
                  type="button"
                >
                  <span className={`search-result-icon ${result.type}`} aria-hidden="true">
                    {result.type === "content" ? <BookOpen size={20} /> : null}
                    {result.entity === "doctor" ? <Stethoscope size={20} /> : null}
                    {result.entity === "hospital" ? <House size={20} /> : null}
                    {result.type === "community" ? <MessageCircle size={20} /> : null}
                  </span>
                  <span className="search-result-content">
                    <strong>{result.title}</strong>
                    <span>{result.subtitle}</span>
                    <small>{result.summary}</small>
                    <span className="search-tag-row">
                      {result.tags.map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                    </span>
                    <span className="search-result-meta">
                      <Star size={14} aria-hidden="true" />
                      {result.meta}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {selectionMessage ? (
              <p className="public-inline-status" role="status">
                {selectionMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ContentCard({ item }: { item: (typeof browseContentItems)[number] }) {
  const { requestAuth } = usePublicAuth();
  const [saved, setSaved] = useState(false);
  const [entryStatus, setEntryStatus] = useState("");
  const isDoctorOnly = item.title === "면허 인증 커뮤니티";

  const handleDoctorEntry = () => {
    requestAuth("면허 인증 커뮤니티 입장", (authedUser) => {
      if (authedUser.tier !== "verified_doctor") {
        setEntryStatus("의사인증회원 권한이 필요합니다.");
        return;
      }

      setEntryStatus("의사 인증회원으로 전용 커뮤니티에 입장했습니다.");
    });
  };

  return (
    <article className="public-content-card">
      <div className="public-card-topline">
        <span>{item.category}</span>
        <BookOpen size={18} aria-hidden="true" />
      </div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <span className="public-card-meta">{item.meta}</span>
      <div className="public-card-actions">
        <button
          aria-label={`${item.title} 저장`}
          className={saved ? "public-success-button" : "public-ghost-button"}
          onClick={() => requestAuth(`${item.title} 저장`, () => setSaved(true))}
          type="button"
        >
          <Bookmark size={17} aria-hidden="true" />
          {saved ? "저장됨" : "저장"}
        </button>
        {isDoctorOnly ? (
          <button
            aria-label="면허 인증 커뮤니티 입장"
            className="public-primary-button"
            onClick={handleDoctorEntry}
            type="button"
          >
            <ShieldCheck size={17} aria-hidden="true" />
            입장
          </button>
        ) : null}
        {saved ? <span className="public-inline-status">{item.title} 저장 완료</span> : null}
        {entryStatus ? (
          <span className="public-inline-status" role="status">
            {entryStatus}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function ReviewRatingSection() {
  const { user, requestAuth } = usePublicAuth();
  const [reviews, setReviews] = useState<ProfileReview[]>(initialProfileReviews);
  const [draftOpen, setDraftOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const summary = useMemo(() => summarizeReviews(reviews), [reviews]);
  const currentUserReview = user
    ? reviews.find(
        (review) =>
          review.targetUserId === reviewTargetProfile.userId && review.authorUserId === user.userId,
      )
    : undefined;

  const openReviewForm = () => {
    setFeedback("");
    setDraftOpen(true);
  };

  const startReview = () => {
    if (!user) {
      requestAuth("리뷰 작성", openReviewForm);
      return;
    }

    openReviewForm();
  };

  const submitReview = (draft: ReviewDraft) => {
    if (!user) return;

    const nextReview: ProfileReview = {
      id: currentUserReview?.id || `review-${user.userId}`,
      targetUserId: reviewTargetProfile.userId,
      authorUserId: user.userId,
      authorName: user.name,
      authorSpecialty: "의사인증회원",
      rating: draft.rating,
      title: draft.title,
      body: draft.body,
      createdAtLabel: currentUserReview ? "방금 수정" : "방금 전",
    };

    setReviews((currentReviews) => {
      if (currentUserReview) {
        return currentReviews.map((review) =>
          review.id === currentUserReview.id ? nextReview : review,
        );
      }

      return [nextReview, ...currentReviews];
    });
    setDraftOpen(false);
    setFeedback(
      `${reviewTargetProfile.name} 프로필에 ${draft.rating}점 리뷰가 ${
        currentUserReview ? "수정" : "등록"
      }되었습니다.`,
    );
  };

  return (
    <section className="public-reviews-band" aria-labelledby="profile-reviews-title">
      <div className="public-section-title">
        <div>
          <span className="public-eyebrow">
            <Star size={16} aria-hidden="true" />
            Review & Rating
          </span>
          <h2 id="profile-reviews-title">전문의 프로필 리뷰</h2>
          <p>평점 집계와 전문가 뱃지가 포함된 리뷰를 공개로 확인할 수 있습니다.</p>
        </div>
        <button className="public-primary-button" onClick={startReview} type="button">
          <PencilLine size={18} aria-hidden="true" />
          {currentUserReview ? "내 리뷰 수정" : "리뷰 작성"}
        </button>
      </div>

      <div className="review-profile-layout">
        <article className="review-target-panel" aria-label={`${reviewTargetProfile.name} 프로필`}>
          <div className="review-target-avatar" aria-hidden="true">
            {reviewTargetProfile.name.slice(0, 1)}
          </div>
          <div>
            <p className="review-profile-kicker">리뷰 대상</p>
            <h3>{reviewTargetProfile.name}</h3>
            <strong>{reviewTargetProfile.title}</strong>
            <span>{reviewTargetProfile.specialty}</span>
            <p>{reviewTargetProfile.summary}</p>
          </div>
          <div className="review-summary-card">
            <strong>평균 {summary.averageLabel}</strong>
            <ReviewStars rating={Number(summary.averageLabel)} />
            <span>{summary.count}개 리뷰</span>
          </div>
          <div className="review-distribution" aria-label="평점 분포">
            {distributionScores.map((score) => {
              const count = summary.distribution[score] || 0;
              const percentage = summary.count ? (count / summary.count) * 100 : 0;

              return (
                <div className="review-distribution-row" key={score}>
                  <span>{score}점</span>
                  <div className="review-rating-bar" aria-hidden="true">
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <div className="review-workspace">
          {feedback ? (
            <p className="review-feedback" role="status">
              <CheckCircle2 size={17} aria-hidden="true" />
              {feedback}
            </p>
          ) : null}

          {draftOpen ? (
            <ReviewForm
              existingReview={currentUserReview}
              onCancel={() => setDraftOpen(false)}
              onSubmit={submitReview}
              target={reviewTargetProfile}
              user={user}
            />
          ) : null}

          <div className="profile-review-list" role="list" aria-label="프로필 리뷰 목록">
            {reviews.map((review) => (
              <article className="profile-review-row" key={review.id} role="listitem">
                <div className="profile-review-header">
                  <div>
                    <strong>{review.authorName}</strong>
                    <span className="review-expert-badge">
                      <ShieldCheck size={14} aria-hidden="true" />
                      전문가 뱃지 · {review.authorSpecialty}
                    </span>
                  </div>
                  <span className="review-score-pill">
                    <ReviewStars rating={review.rating} />
                    {review.rating}점
                  </span>
                </div>
                <h3>{review.title}</h3>
                <p>{review.body}</p>
                <span className="profile-review-date">{review.createdAtLabel}</span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  const roundedRating = Math.round(rating);

  return (
    <span className="review-stars" aria-hidden="true">
      {ratingOptions.map((score) => (
        <Star
          className={score <= roundedRating ? "review-star filled" : "review-star"}
          key={score}
          size={15}
        />
      ))}
    </span>
  );
}

function ReviewForm({
  existingReview,
  onCancel,
  onSubmit,
  target,
  user,
}: {
  existingReview?: ProfileReview;
  onCancel: () => void;
  onSubmit: (draft: ReviewDraft) => void;
  target: ReviewTargetProfile;
  user: PublicUser | null;
}) {
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [title, setTitle] = useState(existingReview?.title || "");
  const [body, setBody] = useState(existingReview?.body || "");
  const [error, setError] = useState("");

  if (!user) {
    return null;
  }

  if (user.tier !== "verified_doctor") {
    return (
      <div className="review-rule-card" role="status">
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>의사인증회원만 리뷰를 작성할 수 있습니다.</strong>
          <p>평점과 리뷰 작성은 인증된 의료진 계정으로 제한됩니다.</p>
        </div>
        <button className="public-ghost-button" onClick={onCancel} type="button">
          닫기
        </button>
      </div>
    );
  }

  if (user.userId === target.userId) {
    return (
      <div className="review-rule-card" role="status">
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>본인 프로필에는 리뷰를 작성할 수 없습니다.</strong>
          <p>리뷰 대상과 작성자가 같으면 등록이 제한됩니다.</p>
        </div>
        <button className="public-ghost-button" onClick={onCancel} type="button">
          닫기
        </button>
      </div>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!rating || !body.trim()) {
      setError("평점과 리뷰 내용을 입력해 주세요.");
      return;
    }

    setError("");
    onSubmit({
      rating,
      title: title.trim() || `${target.name} 리뷰`,
      body: body.trim(),
    });
  };

  return (
    <form className="review-form-panel" onSubmit={handleSubmit}>
      <div className="review-form-heading">
        <div>
          <h3>{existingReview ? "내 리뷰 수정" : "리뷰 작성"}</h3>
          <p>{target.name} 프로필에 남길 평점과 리뷰를 입력하세요.</p>
        </div>
        <button className="public-icon-button" onClick={onCancel} type="button" aria-label="리뷰 작성 닫기">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="review-rating-picker" role="group" aria-label="평점 선택">
        {ratingOptions.map((score) => (
          <button
            aria-label={`${score}점 선택`}
            aria-pressed={rating === score}
            className={rating >= score ? "selected" : ""}
            key={score}
            onClick={() => {
              setRating(score);
              setError("");
            }}
            type="button"
          >
            <Star size={20} aria-hidden="true" />
          </button>
        ))}
      </div>

      <label>
        리뷰 제목
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="핵심 평가를 입력하세요"
          type="text"
          value={title}
        />
      </label>
      <label>
        리뷰 내용
        <textarea
          onChange={(event) => {
            setBody(event.target.value);
            setError("");
          }}
          placeholder="전문가 관점에서 도움이 된 점을 적어주세요"
          rows={4}
          value={body}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="public-primary-button" type="submit">
        <Send size={18} aria-hidden="true" />
        {existingReview ? "리뷰 수정" : "리뷰 등록"}
      </button>
    </form>
  );
}

function DoctorVerificationPage() {
  const { user } = usePublicAuth();
  const { getApplicationForUser, submitApplication } = useDoctorVerification();
  const application = user ? getApplicationForUser(user.email) : null;
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseName, setLicenseName] = useState(user?.name ?? "");
  const [specialty, setSpecialty] = useState("");
  const [proofFilename, setProofFilename] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const canSubmit = !application || application.status === "rejected";

  if (!user) {
    return null;
  }

  const currentStatusLabel = application
    ? doctorVerificationStatusLabels[application.status]
    : "신청 전";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!licenseNumber.trim() || !licenseName.trim() || !proofFilename) {
      setError("면허번호, 면허상 이름, 증빙 파일을 모두 입력해 주세요.");
      setSuccessMessage("");
      return;
    }

    submitApplication({
      applicantEmail: user.email,
      applicantName: user.name,
      licenseNumber: licenseNumber.trim(),
      licenseName: licenseName.trim(),
      specialty: specialty.trim(),
      proofFilename,
    });
    setError("");
    setSuccessMessage("면허 인증 신청이 접수되었습니다.");
  };

  return (
    <section className="doctor-verification-page" aria-labelledby="doctor-verification-title">
      <div className="public-page-header compact">
        <span className="public-eyebrow">
          <ShieldCheck size={16} aria-hidden="true" />
          Doctor verification
        </span>
        <h1 id="doctor-verification-title">의사 면허 인증</h1>
        <p>면허 정보와 증빙 자료를 제출하면 운영자가 검수한 뒤 전문가 뱃지를 부여합니다.</p>
      </div>

      {successMessage ? (
        <p className="verification-result approved" role="status">
          {successMessage}
        </p>
      ) : null}

      <div className="doctor-verification-grid">
        <article className="verification-status-card">
          <span className={`verification-status ${application?.status ?? "none"}`}>
            {currentStatusLabel}
          </span>
          <h2>{application?.status === "approved" ? "의사인증회원" : "인증 상태"}</h2>
          {application ? (
            <dl className="verification-metadata">
              <div>
                <dt>면허번호</dt>
                <dd>{application.licenseNumber}</dd>
              </div>
              <div>
                <dt>면허상 이름</dt>
                <dd>{application.licenseName}</dd>
              </div>
              <div>
                <dt>증빙</dt>
                <dd>{application.proofFilename}</dd>
              </div>
            </dl>
          ) : (
            <p>아직 제출된 인증 신청이 없습니다.</p>
          )}
          {application?.status === "rejected" ? (
            <p className="verification-result rejected">반려 사유: {application.rejectionReason}</p>
          ) : null}
          {application?.status === "approved" ? (
            <p className="verification-result approved">전문가 뱃지가 활성화되었습니다.</p>
          ) : null}
        </article>

        {canSubmit ? (
          <form className="doctor-verification-form" onSubmit={handleSubmit}>
            <label>
              면허번호
              <input
                autoComplete="off"
                onChange={(event) => {
                  setLicenseNumber(event.target.value);
                  setError("");
                }}
                placeholder="2026-0001"
                value={licenseNumber}
              />
            </label>
            <label>
              면허상 이름
              <input
                autoComplete="name"
                onChange={(event) => {
                  setLicenseName(event.target.value);
                  setError("");
                }}
                placeholder="홍길동"
                value={licenseName}
              />
            </label>
            <label>
              전문과목
              <input
                onChange={(event) => setSpecialty(event.target.value)}
                placeholder="내과"
                value={specialty}
              />
            </label>
            <label>
              증빙 파일
              <input
                accept="application/pdf,image/*"
                onChange={(event) => {
                  setProofFilename(event.target.files?.[0]?.name ?? "");
                  setError("");
                }}
                type="file"
              />
            </label>
            {proofFilename ? <p className="public-inline-status">{proofFilename}</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
            {successMessage ? (
              <p className="verification-result approved" role="status">
                {successMessage}
              </p>
            ) : null}
            <button className="public-primary-button" type="submit">
              <ShieldCheck size={18} aria-hidden="true" />
              {application?.status === "rejected" ? "재신청 제출" : "인증 신청 제출"}
            </button>
          </form>
        ) : (
          <div className="verification-locked-note">
            <CheckCircle2 size={20} aria-hidden="true" />
            <p>
              {application?.status === "pending"
                ? "신청이 접수되어 운영자 검수를 기다리고 있습니다."
                : "승인 완료된 신청은 다시 제출할 수 없습니다."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

type SignupErrors = {
  email: boolean;
  password: boolean;
  agreements: boolean;
};

function SignupPage() {
  const { requestAuth } = usePublicAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serviceTerms, setServiceTerms] = useState(false);
  const [privacyTerms, setPrivacyTerms] = useState(false);
  const [marketingTerms, setMarketingTerms] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({
    email: false,
    password: false,
    agreements: false,
  });
  const [alertMessage, setAlertMessage] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success">("idle");

  const hasAnyInput =
    email.trim().length > 0 || password.length > 0 || serviceTerms || privacyTerms || marketingTerms;
  const allAgreementsChecked = serviceTerms && privacyTerms && marketingTerms;
  const requiredAgreementsChecked = serviceTerms && privacyTerms;

  const resetSubmitFeedback = () => {
    setSubmitState("idle");
    setAlertMessage("");
  };

  const handleAgreementAll = (checked: boolean) => {
    setServiceTerms(checked);
    setPrivacyTerms(checked);
    setMarketingTerms(checked);
    setErrors((current) => ({ ...current, agreements: false }));
    resetSubmitFeedback();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitState === "submitting") {
      return;
    }

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const passwordValid = password.length >= 8;
    const nextErrors = {
      email: !emailValid,
      password: !passwordValid,
      agreements: !requiredAgreementsChecked,
    };

    setErrors(nextErrors);

    if (nextErrors.email || nextErrors.password || nextErrors.agreements) {
      setSubmitState("idle");
      setAlertMessage("입력한 정보를 다시 확인해주세요.");
      return;
    }

    setAlertMessage("");
    setSubmitState("submitting");

    window.setTimeout(() => {
      if (email.trim().toLowerCase().includes("error")) {
        setSubmitState("idle");
        setAlertMessage("회원가입 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      setSubmitState("success");
    }, 800);
  };

  return (
    <section className="signup-screen" aria-labelledby="signup-title">
      <header className="signup-mobile-header">
        <button
          aria-label="뒤로"
          className="public-icon-button"
          onClick={() => navigate("/")}
          type="button"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <strong>회원가입</strong>
      </header>

      <div className="signup-body">
        <div className="signup-intro">
          <h1 id="signup-title">계정을 만들어보세요</h1>
          <p>몇 가지 정보만 입력하면 시작할 수 있어요.</p>
        </div>

        <div className="signup-state-row" aria-live="polite">
          <span>{hasAnyInput ? "가입 정보 입력 중" : "가입 정보 입력 전"}</span>
          <p>
            {hasAnyInput
              ? "필수 입력값과 약관 동의 상태를 확인하고 있습니다."
              : "아직 입력된 정보가 없습니다. 이메일, 비밀번호, 필수 약관을 채워주세요."}
          </p>
        </div>

        {alertMessage ? (
          <div aria-label="회원가입 오류" className="signup-alert" role="alert">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{alertMessage}</span>
          </div>
        ) : null}

        {submitState === "success" ? (
          <div className="signup-success" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>회원가입이 완료되었습니다.</span>
          </div>
        ) : null}

        <form className="signup-form" noValidate onSubmit={handleSubmit}>
          <div className="signup-field">
            <label htmlFor="signup-email">
              이메일 <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={errors.email ? "signup-email-error" : undefined}
              aria-invalid={errors.email}
              autoComplete="email"
              data-testid="scr-003-fld-01"
              id="signup-email"
              inputMode="email"
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: false }));
                resetSubmitFeedback();
              }}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            {errors.email ? (
              <span className="signup-field-error" id="signup-email-error">
                올바른 이메일 형식이 아닙니다.
              </span>
            ) : null}
          </div>

          <div className="signup-field">
            <label htmlFor="signup-password">
              비밀번호 <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={errors.password ? "signup-password-error" : undefined}
              aria-invalid={errors.password}
              autoComplete="new-password"
              data-testid="scr-003-fld-02"
              id="signup-password"
              minLength={8}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrors((current) => ({ ...current, password: false }));
                resetSubmitFeedback();
              }}
              placeholder="8자 이상 입력"
              required
              type="password"
              value={password}
            />
            {errors.password ? (
              <span className="signup-field-error" id="signup-password-error">
                비밀번호는 8자 이상이어야 합니다.
              </span>
            ) : null}
          </div>

          <fieldset
            aria-describedby={errors.agreements ? "signup-agreement-error" : undefined}
            className="signup-agreements"
            data-testid="scr-003-fld-03"
          >
            <legend>약관 동의</legend>
            <label className="signup-check all">
              <input
                checked={allAgreementsChecked}
                onChange={(event) => handleAgreementAll(event.target.checked)}
                type="checkbox"
              />
              <span>전체 약관에 동의합니다</span>
            </label>
            <label className="signup-check">
              <input
                checked={serviceTerms}
                data-testid="scr-003-act-02"
                onChange={(event) => {
                  setServiceTerms(event.target.checked);
                  setErrors((current) => ({ ...current, agreements: false }));
                  resetSubmitFeedback();
                }}
                type="checkbox"
              />
              <span>(필수) 서비스 이용약관 동의</span>
            </label>
            <label className="signup-check">
              <input
                checked={privacyTerms}
                onChange={(event) => {
                  setPrivacyTerms(event.target.checked);
                  setErrors((current) => ({ ...current, agreements: false }));
                  resetSubmitFeedback();
                }}
                type="checkbox"
              />
              <span>(필수) 개인정보 처리방침 동의</span>
            </label>
            <label className="signup-check">
              <input
                checked={marketingTerms}
                onChange={(event) => {
                  setMarketingTerms(event.target.checked);
                  resetSubmitFeedback();
                }}
                type="checkbox"
              />
              <span>(선택) 마케팅 정보 수신 동의</span>
            </label>
            {errors.agreements ? (
              <span className="signup-field-error" id="signup-agreement-error">
                필수 약관에 동의해주세요.
              </span>
            ) : null}
          </fieldset>

          <div data-testid="scr-003-fld-04">
            <button
              className="public-primary-button signup-submit"
              data-testid="scr-003-act-01"
              disabled={submitState === "submitting"}
              type="submit"
            >
              {submitState === "submitting" ? "가입 처리 중" : "가입하기"}
            </button>
          </div>

          <p className="signup-login-link">
            이미 계정이 있으신가요?{" "}
            <button
              className="signup-text-button"
              onClick={() => requestAuth("로그인", () => navigate("/my"))}
              type="button"
            >
              로그인
            </button>
          </p>
        </form>
      </div>
    </section>
  );
}

function CommunityPage() {
  const { user, requestAuth } = usePublicAuth();
  const [activeTab, setActiveTab] = useState<CommunityTab>("disease");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [selectedSort, setSelectedSort] = useState<CommunitySort>("최신");
  const [screenState, setScreenState] = useState<CommunityState>("default");
  const loadTimerRef = useRef<number | null>(null);
  const posts = useMemo(
    () => getCommunityPosts(selectedCategory, selectedSort),
    [selectedCategory, selectedSort],
  );
  const visibleCategories = communityCategories[activeTab];
  const totalLabel =
    selectedCategory === "전체" && screenState === "default"
      ? "총 20건"
      : `총 ${posts.length}건`;

  const clearLoadTimer = useCallback(() => {
    if (loadTimerRef.current) {
      window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLoadTimer, [clearLoadTimer]);

  const finishLoadForCategory = useCallback(
    (category: string) => {
      clearLoadTimer();
      setScreenState("loading");
      loadTimerRef.current = window.setTimeout(() => {
        if (category === "위염") {
          setScreenState("error");
          return;
        }

        setScreenState(getCommunityPosts(category, selectedSort).length ? "default" : "empty");
      }, 160);
    },
    [clearLoadTimer, selectedSort],
  );

  const handleTabSelect = (tab: CommunityTab) => {
    setActiveTab(tab);
    setSelectedCategory("전체");
    setScreenState("default");
    clearLoadTimer();
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    finishLoadForCategory(category);
  };

  const handleSortSelect = (sort: CommunitySort) => {
    setSelectedSort(sort);

    if (screenState !== "loading" && screenState !== "error" && screenState !== "permission") {
      setScreenState(getCommunityPosts(selectedCategory, sort).length ? "default" : "empty");
    }
  };

  const handleRetry = () => {
    setSelectedCategory("전체");
    clearLoadTimer();
    setScreenState("loading");
    loadTimerRef.current = window.setTimeout(() => setScreenState("default"), 160);
  };

  const handleWrite = () => {
    if (!user) {
      setScreenState("permission");
    }

    requestAuth("게시글 작성", () => navigate("/items/new"));
  };

  return (
    <section className="community-screen" data-screen="SCR-007" data-state={screenState}>
      <div className="community-header">
        <span className="public-eyebrow">
          <MessageCircle size={16} aria-hidden="true" />
          Community
        </span>
        <h1>커뮤니티</h1>
        <p>게시물 내용은 개인 경험에 기반한 참고용 정보입니다.</p>
      </div>

      <div className="community-toolbar">
        <div className="community-tabs" role="tablist" aria-label="커뮤니티 분류">
          {([
            ["disease", "질병별"],
            ["dept", "진료과별"],
          ] as const).map(([tab, label]) => (
            <button
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "community-tab active" : "community-tab"}
              key={tab}
              onClick={() => handleTabSelect(tab)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="community-category-strip"
          data-field="category"
          data-testid="scr-007-fld-01"
        >
          <div className="community-chip-row" data-testid="scr-007-act-01">
            {visibleCategories.map((category) => (
              <button
                aria-pressed={selectedCategory === category}
                className={
                  selectedCategory === category
                    ? "community-chip selected"
                    : "community-chip"
                }
                data-value={category}
                key={category}
                onClick={() => handleCategorySelect(category)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="community-sortbar" data-field="sort" data-testid="scr-007-fld-02">
          <span>{totalLabel}</span>
          <div className="community-sort-group" data-testid="scr-007-act-02">
            {(["최신", "인기", "동병상련"] as CommunitySort[]).map((sort) => (
              <button
                aria-pressed={selectedSort === sort}
                className={
                  selectedSort === sort
                    ? "community-sort-button selected"
                    : "community-sort-button"
                }
                data-value={sort}
                key={sort}
                onClick={() => handleSortSelect(sort)}
                type="button"
              >
                {sort}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="community-body">
        {screenState === "loading" ? (
          <CommunityStatePanel
            description="게시글을 불러오고 있습니다."
            icon="loading"
            state="loading"
          />
        ) : null}

        {screenState === "error" ? (
          <CommunityStatePanel
            actionLabel="새로 고침"
            description="일시적인 문제가 발생했어요."
            icon="error"
            onAction={handleRetry}
            state="error"
          />
        ) : null}

        {screenState === "empty" ? (
          <CommunityStatePanel
            description="첫 글을 작성해보세요."
            icon="empty"
            state="empty"
            title="아직 게시글이 없어요."
          />
        ) : null}

        {screenState === "permission" ? (
          <CommunityStatePanel
            actionLabel="로그인하기"
            description="이 작업은 로그인이 필요해요."
            icon="permission"
            onAction={() => requestAuth("게시글 작성", () => navigate("/items/new"))}
            state="permission"
          />
        ) : null}

        {screenState === "default" ? (
          <div className="community-post-list" data-field="postCards" data-testid="scr-007-fld-03">
            {posts.map((post) => (
              <CommunityPostCard
                key={post.id}
                post={post}
                testId={post.id === "1" ? "scr-007-act-03" : undefined}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="community-write-area" data-field="writeButton" data-testid="scr-007-fld-04">
        <button
          aria-label="글쓰기"
          className="community-write-button"
          data-testid="scr-007-act-04"
          onClick={handleWrite}
          type="button"
        >
          <PencilLine size={21} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function CommunityStatePanel({
  actionLabel,
  description,
  icon,
  onAction,
  state,
  title,
}: {
  actionLabel?: string;
  description: string;
  icon: "empty" | "error" | "loading" | "permission";
  onAction?: () => void;
  state: CommunityState;
  title?: string;
}) {
  const Icon =
    icon === "error"
      ? AlertCircle
      : icon === "permission"
        ? LockKeyhole
        : icon === "loading"
          ? RefreshCw
          : MessageCircle;

  return (
    <div
      aria-live={state === "loading" ? "polite" : undefined}
      className={`community-state-panel ${state}`}
      role={state === "error" ? "alert" : state === "loading" ? "status" : undefined}
    >
      <span className="community-state-icon" aria-hidden="true">
        <Icon size={30} />
      </span>
      {title ? <h2>{title}</h2> : null}
      <p>{description}</p>
      {state === "loading" ? (
        <div className="community-skeleton-stack" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {actionLabel && onAction ? (
        <button className="public-ghost-button" onClick={onAction} type="button">
          {actionLabel === "새로 고침" ? <RefreshCw size={17} aria-hidden="true" /> : null}
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function CommunityPostCard({
  post,
  testId,
}: {
  post: CommunityPost;
  testId?: string;
}) {
  return (
    <button
      className={post.private ? "community-post-card private" : "community-post-card"}
      data-post-id={post.id}
      data-testid={testId}
      onClick={() => navigate(`/community/posts/${post.id}`)}
      type="button"
    >
      <span className="community-post-author">
        <span className="community-avatar" aria-hidden="true">
          {post.initials}
        </span>
        <span>
          <span className="community-author-line">
            <strong>{post.author}</strong>
            {post.doctorVerified ? (
              <span className="community-badge primary">
                <Stethoscope size={12} aria-hidden="true" />
                의사 인증
              </span>
            ) : null}
            {post.visitVerified ? (
              <span className="community-badge">
                <CheckCircle2 size={12} aria-hidden="true" />
                병원 진료 인증
              </span>
            ) : null}
          </span>
          <span className="community-post-date">{post.date}</span>
        </span>
      </span>

      <span className="community-post-title">{post.title}</span>
      {post.excerpt ? <span className="community-post-excerpt">{post.excerpt}</span> : null}
      {post.imageCount ? (
        <span className="community-image-count">+{post.imageCount}</span>
      ) : null}
      {!post.private ? (
        <span className="community-post-metrics">
          <span>
            <MessageCircle size={14} aria-hidden="true" />
            {post.comments}
          </span>
          <span>
            <Heart size={14} aria-hidden="true" />
            공감 {post.empathy}
          </span>
          <span>
            <UserPlus size={14} aria-hidden="true" />
            동병상련 {post.fellows}
          </span>
        </span>
      ) : null}
    </button>
  );
}

function PostDetailPage({ postId }: { postId: string }) {
  const { requestAuth } = usePublicAuth();
  const [comments, setComments] = useState(postDetail.comments);
  const [commentDraft, setCommentDraft] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = commentDraft.trim();

    if (!body) {
      return;
    }

    requestAuth("댓글 작성", () => {
      setComments((currentComments) => [
        ...currentComments,
        {
          id: `comment-${currentComments.length + 1}`,
          author: "나",
          avatarUrl: "https://i.pravatar.cc/64?img=32",
          body,
          age: "방금 전",
        },
      ]);
      setCommentDraft("");
      setActionMessage("댓글이 등록되었습니다.");
    });
  };

  if (postId === "loading") {
    return (
      <section className="post-detail-screen" data-state="loading">
        <PostDetailHeader />
        <div aria-label="게시글 로딩" className="post-state-panel" role="status">
          <span className="post-skeleton short" />
          <span className="post-skeleton tall" />
          <span className="post-skeleton" />
          <p>게시글을 불러오는 중입니다.</p>
        </div>
      </section>
    );
  }

  if (postId === "error") {
    return (
      <section className="post-detail-screen" data-state="error">
        <PostDetailHeader />
        <PostStatePanel
          description="잠시 후 다시 시도해 주세요."
          icon={<AlertCircle size={36} aria-hidden="true" />}
          title="게시글을 불러오지 못했습니다."
          tone="error"
        >
          <button
            className="public-primary-button compact-action"
            onClick={() => navigate("/community/posts/run-night")}
            type="button"
          >
            <RefreshCw size={16} aria-hidden="true" />
            다시 시도
          </button>
        </PostStatePanel>
      </section>
    );
  }

  if (postId === "missing") {
    return (
      <section className="post-detail-screen" data-state="empty">
        <PostDetailHeader />
        <PostStatePanel
          description="삭제되었거나 존재하지 않는 게시글입니다."
          icon={<BookOpen size={36} aria-hidden="true" />}
          title="게시글이 없습니다."
        />
      </section>
    );
  }

  if (postId === "private-case") {
    return (
      <section className="post-detail-screen" data-state="permission">
        <PostDetailHeader />
        <PostStatePanel
          description="로그인 후 이용해 주세요."
          icon={<LockKeyhole size={36} aria-hidden="true" />}
          title="접근 권한이 없습니다."
          tone="warning"
        >
          <button
            className="public-primary-button compact-action"
            onClick={() =>
              requestAuth("게시글 상세 보기", () => navigate("/community/posts/run-night"))
            }
            type="button"
          >
            <LogIn size={16} aria-hidden="true" />
            로그인
          </button>
        </PostStatePanel>
      </section>
    );
  }

  return (
    <section className="post-detail-screen" data-state="default">
      <PostDetailHeader />

      <div className="post-detail-card">
        <button
          aria-label={`${postDetail.author.name} 작성자 프로필 보기`}
          className="post-author-button"
          data-testid="scr-008-act-02"
          onClick={() => setActionMessage("작성자 프로필을 열었습니다.")}
          type="button"
        >
          <img alt="" src={postDetail.author.avatarUrl} />
          <span className="post-author-copy" data-testid="scr-008-fld-03">
            <strong>{postDetail.author.name}</strong>
            <span>{postDetail.author.meta}</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>

        <article className="post-body" data-testid="scr-008-fld-01">
          <h1>{postDetail.title}</h1>
          <p>{postDetail.body}</p>
          <img alt="한강 야간 러닝 게시글 사진" src={postDetail.imageUrl} />
          <div aria-label="게시글 태그" className="post-tags">
            {postDetail.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </article>

        <div aria-label="게시글 작업" className="post-action-bar">
          <button
            aria-label="공유하기"
            className="post-action-button"
            data-testid="scr-008-act-04"
            onClick={() => setActionMessage("공유 링크를 복사했어요.")}
            type="button"
          >
            <span data-testid="scr-008-fld-05">
              <Link2 size={17} aria-hidden="true" />
              공유
            </span>
          </button>
          <button
            aria-label="신고하기"
            className="post-action-button danger"
            data-testid="scr-008-act-03"
            onClick={() =>
              requestAuth("게시글 신고", () => setActionMessage("신고가 접수되었습니다."))
            }
            type="button"
          >
            <span data-testid="scr-008-fld-04">
              <Flag size={17} aria-hidden="true" />
              신고
            </span>
          </button>
        </div>

        {actionMessage ? (
          <p className="post-action-message" role="status">
            {actionMessage}
          </p>
        ) : null}

        <section className="post-comments" data-testid="scr-008-fld-02">
          <h2>
            댓글 <span>{comments.length}</span>
          </h2>
          <ul>
            {comments.map((comment) => (
              <li key={comment.id}>
                <img alt="" src={comment.avatarUrl} />
                <div>
                  <div className="comment-bubble">
                    <strong>{comment.author}</strong>
                    <p>{comment.body}</p>
                  </div>
                  <span>{comment.age}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <form
          className="post-comment-form"
          data-testid="scr-008-act-01"
          onSubmit={handleCommentSubmit}
        >
          <label className="sr-only" htmlFor="post-comment-input">
            댓글 입력
          </label>
          <input
            id="post-comment-input"
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="댓글을 입력하세요"
            type="text"
            value={commentDraft}
          />
          <button aria-label="댓글 등록" type="submit">
            <Send size={17} aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  );
}

function PostDetailHeader() {
  return (
    <header className="post-detail-header">
      <button aria-label="뒤로" onClick={() => navigate("/community")} type="button">
        <ArrowLeft size={18} aria-hidden="true" />
      </button>
      <span>게시글 상세</span>
    </header>
  );
}

function PostStatePanel({
  children,
  description,
  icon,
  title,
  tone = "neutral",
}: {
  children?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
  tone?: "neutral" | "warning" | "error";
}) {
  return (
    <div className={`post-state-panel ${tone}`}>
      <span className="post-state-icon">{icon}</span>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  );
}

function ContentEditorPage() {
  const { user, requestAuth } = usePublicAuth();
  const [draft, setDraft] = useState({
    title: "",
    category: "",
    summary: "",
    conditionTags: "",
    status: "draft" as ContentStatus,
    body: "",
  });
  const [saveState, setSaveState] = useState<"idle" | "loading" | "error" | "saved">("idle");

  const isEmpty =
    !draft.title.trim() &&
    !draft.category.trim() &&
    !draft.summary.trim() &&
    !draft.conditionTags.trim() &&
    !draft.body.trim() &&
    saveState === "idle";
  const canSave = Boolean(draft.title.trim() && draft.body.trim());
  const screenState: ContentEditorScreenState = !user
    ? "permission"
    : saveState === "loading"
      ? "loading"
      : saveState === "error"
        ? "error"
        : isEmpty
          ? "empty"
          : "default";

  const updateDraft = <Field extends keyof typeof draft>(
    field: Field,
    value: (typeof draft)[Field],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));

    if (saveState === "error" || saveState === "saved") {
      setSaveState("idle");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSave || saveState === "loading") {
      return;
    }

    setSaveState("loading");

    window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          contentEditorDraftKey,
          JSON.stringify({
            ...draft,
            category: draft.category || "free",
            conditionTags: draft.conditionTags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            savedAt: new Date().toISOString(),
          }),
        );
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 120);
  };

  if (!user) {
    return (
      <section
        aria-labelledby="content-editor-permission-title"
        className="content-editor-screen permission"
        data-screen="SCR-009"
        data-state="permission"
      >
        <header className="content-editor-header">
          <button
            aria-label="뒤로"
            className="public-icon-button"
            onClick={() => navigate("/community")}
            type="button"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <strong>작성/편집</strong>
        </header>

        <div className="content-editor-state-panel" data-testid="scr-009-permission">
          <LockKeyhole size={34} aria-hidden="true" />
          <h1 id="content-editor-permission-title">로그인이 필요합니다</h1>
          <p>콘텐츠를 작성하려면 로그인해 주세요.</p>
          <button
            className="public-primary-button"
            onClick={() => requestAuth("콘텐츠 작성", () => navigate("/items/new"))}
            type="button"
          >
            <LogIn size={17} aria-hidden="true" />
            로그인하러 가기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="content-editor-title"
      className="content-editor-screen"
      data-screen="SCR-009"
      data-state={screenState}
    >
      <header className="content-editor-header">
        <button
          aria-label="뒤로"
          className="public-icon-button"
          onClick={() => navigate("/community")}
          type="button"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h1 id="content-editor-title">작성/편집</h1>
      </header>

      {saveState === "loading" ? (
        <div className="content-editor-loading" role="status">
          <RefreshCw size={18} aria-hidden="true" />
          <span>저장 중입니다...</span>
        </div>
      ) : null}

      {saveState === "error" ? (
        <div className="content-editor-alert" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <strong>저장에 실패했습니다</strong>
            <p>네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          <button className="public-ghost-button" onClick={() => setSaveState("idle")} type="button">
            <RefreshCw size={16} aria-hidden="true" />
            다시 시도
          </button>
        </div>
      ) : null}

      {saveState === "saved" ? (
        <div className="content-editor-success" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>임시 저장되었습니다.</span>
        </div>
      ) : null}

      <form
        aria-busy={saveState === "loading"}
        className="content-editor-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="content-editor-field" data-testid="scr-009-fld-01">
          <label htmlFor="content-editor-title-input">
            제목 <span aria-hidden="true">*</span>
          </label>
          <input
            aria-label="제목"
            autoComplete="off"
            disabled={saveState === "loading"}
            id="content-editor-title-input"
            onChange={(event) => updateDraft("title", event.target.value)}
            placeholder="제목을 입력하세요"
            required
            type="text"
            value={draft.title}
          />
        </div>

        <div className="content-editor-field" data-testid="scr-009-fld-05">
          <label htmlFor="content-editor-summary">요약</label>
          <input
            aria-label="요약"
            autoComplete="off"
            disabled={saveState === "loading"}
            id="content-editor-summary"
            onChange={(event) => updateDraft("summary", event.target.value)}
            placeholder="콘텐츠 요약을 입력하세요"
            type="text"
            value={draft.summary}
          />
        </div>

        <div className="content-editor-field" data-testid="scr-009-fld-03">
          <label htmlFor="content-editor-category">카테고리</label>
          <select
            aria-label="카테고리"
            disabled={saveState === "loading"}
            id="content-editor-category"
            onChange={(event) => updateDraft("category", event.target.value)}
            value={draft.category}
          >
            <option value="">카테고리를 선택하세요</option>
            {contentEditorCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <div className="content-editor-field">
          <label htmlFor="content-editor-status">상태</label>
          <select
            aria-label="상태"
            disabled={saveState === "loading"}
            id="content-editor-status"
            onChange={(event) => updateDraft("status", event.target.value as ContentStatus)}
            value={draft.status}
          >
            {contentStatusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <div className="content-editor-field" data-testid="scr-009-fld-06">
          <label htmlFor="content-editor-condition-tags">질환 태그</label>
          <input
            aria-label="질환 태그"
            autoComplete="off"
            disabled={saveState === "loading"}
            id="content-editor-condition-tags"
            onChange={(event) => updateDraft("conditionTags", event.target.value)}
            placeholder="예: 폐암, 수술"
            type="text"
            value={draft.conditionTags}
          />
        </div>

        <div className="content-editor-field body" data-testid="scr-009-fld-02">
          <label htmlFor="content-editor-body">
            내용 <span aria-hidden="true">*</span>
          </label>
          <textarea
            aria-label="내용"
            disabled={saveState === "loading"}
            id="content-editor-body"
            onChange={(event) => updateDraft("body", event.target.value)}
            placeholder="내용을 입력하세요"
            required
            rows={8}
            value={draft.body}
          />
          {screenState === "empty" ? (
            <span className="content-editor-help">빈 상태에서는 저장 버튼이 비활성화됩니다.</span>
          ) : null}
        </div>

        <div className="content-editor-actions" data-testid="scr-009-fld-04">
          <button
            className="public-primary-button"
            data-testid="scr-009-act-01"
            disabled={!canSave || saveState === "loading"}
            type="submit"
          >
            <CheckCircle2 size={17} aria-hidden="true" />
            저장
          </button>
          <button
            className="public-ghost-button"
            data-testid="scr-009-act-02"
            onClick={() => navigate("/community")}
            type="button"
          >
            작성 취소
          </button>
        </div>
      </form>
    </section>
  );
}

function WritePage() {
  return (
    <section className="public-page-header">
      <span className="public-eyebrow">
        <PencilLine size={16} aria-hidden="true" />
        Protected
      </span>
      <h1>게시글 작성</h1>
      <p>인증 후 원래 요청한 작성 화면으로 복귀했습니다.</p>
    </section>
  );
}

function MyPage() {
  const { user, logout, requestAuth } = usePublicAuth();
  const { getApplicationForUser } = useDoctorVerification();
  const [screenState, setScreenState] = useState<MyPageScreenState>("default");
  const [activeTab, setActiveTab] = useState<MyPageActivityTab>("posts");
  const [nickname, setNickname] = useState(myPageProfile.name);
  const [statusMessage, setStatusMessage] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);

  const showContent = screenState === "default" || screenState === "empty";
  const verificationApplication = user ? getApplicationForUser(user.email) : null;
  const verificationStatusLabel = verificationApplication
    ? doctorVerificationStatusLabels[verificationApplication.status]
    : "신청 전";

  const setDemoState = (nextState: MyPageScreenState) => {
    setScreenState(nextState);
    setStatusMessage("");

    if (nextState === "empty") {
      setActiveTab("posts");
    }
  };

  const confirmLogout = () => {
    setLogoutOpen(false);
    logout();
    navigate("/");
  };

  return (
    <section className="public-mypage scr-010-screen" aria-labelledby="scr-010-title">
      <header className="public-page-header compact scr-010-header">
        <span className="public-eyebrow">
          <UserRound size={16} aria-hidden="true" />
          My Page
        </span>
        <h1 id="scr-010-title">마이페이지</h1>
        <p>내 프로필, 활동, 저장한 의료진, 계정 설정을 한곳에서 관리합니다.</p>
      </header>

      <div className="scr-010-state-switcher" aria-label="마이페이지 상태">
        {(["default", "empty", "loading", "error", "permission"] as const).map((state) => (
          <button
            aria-pressed={screenState === state}
            className={screenState === state ? "active" : ""}
            key={state}
            onClick={() => setDemoState(state)}
            type="button"
          >
            {state}
          </button>
        ))}
      </div>

      {screenState === "loading" ? (
        <div
          aria-label="마이페이지 불러오는 중"
          className="scr-010-loading"
          role="status"
        >
          <div className="scr-010-profile-skeleton">
            <span className="scr-010-skeleton avatar" />
            <div>
              <span className="scr-010-skeleton line wide" />
              <span className="scr-010-skeleton line" />
            </div>
          </div>
          <span className="scr-010-skeleton block" />
          <span className="scr-010-skeleton panel" />
          <span className="scr-010-skeleton panel" />
        </div>
      ) : null}

      {screenState === "error" ? (
        <div className="scr-010-feedback-state" role="alert">
          <AlertCircle size={42} aria-hidden="true" />
          <h2>일시적인 문제가 발생했어요.</h2>
          <p>잠시 후 다시 시도해 주세요.</p>
          <button
            className="public-primary-button"
            onClick={() => setDemoState("default")}
            type="button"
          >
            <RefreshCw size={17} aria-hidden="true" />
            새로 고침
          </button>
        </div>
      ) : null}

      {screenState === "permission" ? (
        <div className="scr-010-feedback-state">
          <LockKeyhole size={42} aria-hidden="true" />
          <h2>로그인이 필요합니다.</h2>
          <p>마이페이지는 회원 전용입니다.</p>
          <button
            className="public-primary-button"
            data-testid="scr-010-perm-login"
            onClick={() => requestAuth("마이페이지 보기", () => setDemoState("default"))}
            type="button"
          >
            <LogIn size={17} aria-hidden="true" />
            로그인 하러가기
          </button>
        </div>
      ) : null}

      {showContent ? (
        <div className="scr-010-content">
          <section
            className="scr-010-panel scr-010-profile"
            data-field="profile"
            data-testid="scr-010-fld-01"
            aria-labelledby="scr-010-profile-title"
          >
            <div className="scr-010-profile-main">
              <div className="scr-010-avatar" aria-hidden="true">
                코
              </div>
              <div className="scr-010-profile-copy">
                <h2 id="scr-010-profile-title">{myPageProfile.name}</h2>
                <p>
                  {myPageProfile.email}
                  <span>
                    <ShieldCheck size={14} aria-hidden="true" />
                    의사 인증
                  </span>
                </p>
              </div>
              <button
                className="public-ghost-button scr-010-profile-action"
                data-testid="scr-010-act-01"
                onClick={() => setStatusMessage("의사 프로필 수정 화면을 열었습니다.")}
                type="button"
              >
                <PencilLine size={17} aria-hidden="true" />
                의사 프로필 수정
              </button>
            </div>

            <div className="scr-010-verified-card">
              <div>
                <span>실명</span>
                <strong>{myPageProfile.realName}</strong>
              </div>
              <div>
                <span>소속</span>
                <strong>{myPageProfile.organization}</strong>
              </div>
              <div>
                <span>전문</span>
                <strong>{myPageProfile.specialty}</strong>
              </div>
              <div>
                <span>면허 인증</span>
                <strong>{verificationStatusLabel}</strong>
              </div>
              <button
                className="scr-010-lock-note"
                onClick={() => navigate("/doctor-verification")}
                type="button"
              >
                <ShieldCheck size={14} aria-hidden="true" />
                인증 신청/상태 보기
              </button>
            </div>

            <label className="scr-010-nickname">
              <span>닉네임</span>
              <div>
                <input
                  maxLength={10}
                  minLength={2}
                  onChange={(event) => setNickname(event.target.value)}
                  value={nickname}
                />
                <button
                  className="public-ghost-button"
                  onClick={() => setStatusMessage("닉네임이 저장되었습니다.")}
                  type="button"
                >
                  저장
                </button>
              </div>
            </label>
          </section>

          <section
            className="scr-010-activity"
            data-field="activityTabs"
            data-testid="scr-010-fld-02"
            aria-labelledby="scr-010-activity-title"
          >
            <h2 id="scr-010-activity-title">내 활동</h2>
            <div
              className="scr-010-tabs"
              data-testid="scr-010-act-02"
              role="tablist"
              aria-label="내 활동 탭"
            >
              {myPageActivityTabs.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? "active" : ""}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}({tab.count})
                </button>
              ))}
            </div>

            {screenState === "empty" ? (
              <div className="scr-010-empty-state">게시글이 없습니다</div>
            ) : null}

            {screenState === "default" && activeTab === "posts" ? (
              <div className="scr-010-activity-list">
                {myPagePosts.map((post) => (
                  <article
                    className={post.removed ? "scr-010-activity-card muted" : "scr-010-activity-card"}
                    key={post.title}
                  >
                    {post.removed ? (
                      <div className="scr-010-policy-note">
                        <AlertCircle size={16} aria-hidden="true" />
                        <span>{post.title}</span>
                      </div>
                    ) : (
                      <strong>{post.title}</strong>
                    )}
                    <p>{post.description}</p>
                    <div>
                      <span>{post.meta}</span>
                      <span>{post.stats}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {screenState === "default" && activeTab === "comments" ? (
              <div className="scr-010-activity-list">
                {myPageComments.map((comment) => (
                  <article className="scr-010-activity-card" key={comment.body}>
                    <p>{comment.body}</p>
                    <span>{comment.date}</span>
                  </article>
                ))}
              </div>
            ) : null}

            {screenState === "default" && activeTab === "reviews" ? (
              <div className="scr-010-activity-list">
                {myPageReviews.map((review) => (
                  <article className="scr-010-activity-card" key={review.doctor}>
                    <strong>
                      {review.hospital} · {review.doctor}
                    </strong>
                    <p>{review.body}</p>
                    <span className="scr-010-stars" aria-label="별점 5점">
                      ★★★★★
                    </span>
                  </article>
                ))}
              </div>
            ) : null}

            {screenState === "default" && activeTab === "saved" ? (
              <div
                className="scr-010-saved-list"
                data-field="savedItems"
                data-testid="scr-010-fld-03"
              >
                <button
                  className="scr-010-saved-card"
                  data-testid="scr-010-act-03"
                  onClick={() => setStatusMessage("김건강 저장 항목을 열었습니다.")}
                  type="button"
                >
                  <span className="scr-010-saved-avatar" aria-hidden="true">
                    김
                  </span>
                  <span>
                    <strong>{myPageSavedItem.doctor}</strong>
                    <small>{myPageSavedItem.detail}</small>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </section>

          <section
            className="scr-010-settings"
            data-field="settings"
            data-testid="scr-010-fld-04"
            aria-labelledby="scr-010-settings-title"
          >
            <h2 id="scr-010-settings-title">설정</h2>
            <div className="scr-010-settings-list">
              {["공지사항", "의견 보내기", "이용약관", "개인정보처리방침", "위치 기반 서비스 이용약관"].map(
                (label) => (
                  <button
                    key={label}
                    onClick={() => setStatusMessage(`${label}을 열었습니다.`)}
                    type="button"
                  >
                    {label}
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ),
              )}
              <button
                className="danger"
                data-testid="scr-010-act-04"
                onClick={() => setLogoutOpen(true)}
                type="button"
              >
                <LogOut size={16} aria-hidden="true" />
                로그아웃
              </button>
            </div>
          </section>

          {statusMessage ? (
            <p className="scr-010-status" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              {statusMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {logoutOpen ? (
        <div className="scr-010-modal-backdrop">
          <section
            aria-labelledby="scr-010-logout-title"
            aria-modal="true"
            className="scr-010-logout-modal"
            role="dialog"
          >
            <h2 id="scr-010-logout-title">로그아웃</h2>
            <p>로그아웃 하시겠어요?</p>
            <div>
              <button
                className="public-ghost-button"
                onClick={() => setLogoutOpen(false)}
                type="button"
              >
                취소
              </button>
              <button className="public-primary-button danger" onClick={confirmLogout} type="button">
                로그아웃
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="public-route-guard">
      <h1>페이지를 찾을 수 없습니다</h1>
      <PublicLink className="public-primary-button" href="/">
        홈으로 이동
      </PublicLink>
    </section>
  );
}

function AppShellContent() {
  const [route, setRoute] = useState(() => getPublicRoute(window.location.pathname));

  useEffect(() => {
    const handleRouteChange = () => {
      flushSync(() => setRoute(getPublicRoute(window.location.pathname)));
    };
    window.addEventListener("popstate", handleRouteChange);

    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  return (
    <PublicAuthProvider>
      <PublicShell route={route} />
    </PublicAuthProvider>
  );
}

export function AppShell() {
  return (
    <DoctorVerificationProvider>
      <AppShellContent />
    </DoctorVerificationProvider>
  );
}

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(() =>
    window.location.pathname.startsWith("/admin"),
  );

  useEffect(() => {
    const handleRouteChange = () => {
      flushSync(() => setIsAdminRoute(window.location.pathname.startsWith("/admin")));
    };
    window.addEventListener("popstate", handleRouteChange);

    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  return (
    <DoctorVerificationProvider>
      {isAdminRoute ? <AdminApp /> : <AppShellContent />}
    </DoctorVerificationProvider>
  );
}
