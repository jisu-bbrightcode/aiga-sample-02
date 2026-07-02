// BBR-1193 [FE] 신규 화면 별도 구현 — AI 챗봇 / 명의 찾기 / 공지·약관·의견 보내기.
//
// These are NET-NEW screens that do not exist in the base sample. Per the parent
// pixel-perfect issue (BBR-1185) the existing app's routing/logic/mock must stay
// untouched, and nav integration is a separate design task. So every screen here is
// reachable via its own additive route and rendered by a standalone `NewScreensApp`
// mounted from App.tsx only for the new-screen path prefixes. Nothing in the existing
// PublicShell / router is modified. Design tokens (primary #3774e8, secondary #00ca80,
// Pretendard) come from styles.css :root; local layout lives in newScreens.css.
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  ChevronRight,
  Flag,
  House,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Search,
  Stethoscope,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { navigate } from "./App";
import "./newScreens.css";

// ---------------------------------------------------------------------------
// Routing — additive, isolated from the existing SPA router.
// ---------------------------------------------------------------------------

const NEW_SCREEN_PREFIXES = ["/chatbot", "/experts", "/notices", "/feedback", "/terms"];

export function isNewScreenRoute(pathname: string): boolean {
  return NEW_SCREEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

type NewScreenRoute =
  | { view: "chatbotWelcome" }
  | { view: "chatbotList" }
  | { conversationId: string; view: "chatbotChat" }
  | { view: "experts" }
  | { view: "notices" }
  | { noticeId: string; view: "noticeDetail" }
  | { view: "feedback" }
  | { view: "terms" }
  | { view: "notFound" };

function getNewScreenRoute(pathname: string): NewScreenRoute {
  if (pathname === "/chatbot") {
    return { view: "chatbotWelcome" };
  }

  if (pathname === "/chatbot/conversations") {
    return { view: "chatbotList" };
  }

  const chatMatch = pathname.match(/^\/chatbot\/c\/([^/]+)$/);

  if (chatMatch) {
    return { conversationId: decodeURIComponent(chatMatch[1]), view: "chatbotChat" };
  }

  if (pathname === "/experts") {
    return { view: "experts" };
  }

  if (pathname === "/notices") {
    return { view: "notices" };
  }

  const noticeMatch = pathname.match(/^\/notices\/([^/]+)$/);

  if (noticeMatch) {
    return { noticeId: decodeURIComponent(noticeMatch[1]), view: "noticeDetail" };
  }

  if (pathname === "/feedback") {
    return { view: "feedback" };
  }

  if (pathname === "/terms") {
    return { view: "terms" };
  }

  return { view: "notFound" };
}

export function NewScreensApp() {
  const [route, setRoute] = useState(() => getNewScreenRoute(window.location.pathname));

  useEffect(() => {
    const handleRouteChange = () => {
      flushSync(() => setRoute(getNewScreenRoute(window.location.pathname)));
    };
    window.addEventListener("popstate", handleRouteChange);

    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  switch (route.view) {
    case "chatbotWelcome":
      return <ChatbotWelcomePage />;
    case "chatbotList":
      return <ChatbotConversationListPage />;
    case "chatbotChat":
      return <ChatbotChatPage conversationId={route.conversationId} />;
    case "experts":
      return <ExpertsPage />;
    case "notices":
      return <NoticesPage />;
    case "noticeDetail":
      return <NoticeDetailPage noticeId={route.noticeId} />;
    case "feedback":
      return <FeedbackPage />;
    case "terms":
      return <TermsPage />;
    default:
      return <NewScreenNotFound />;
  }
}

// ---------------------------------------------------------------------------
// Shared building blocks.
// ---------------------------------------------------------------------------

function goBack(fallback: string) {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  navigate(fallback);
}

/** Blue header bar used by 명의 찾기 / 공지사항 / 의견 보내기 / 이용약관. */
function NsBlueHeader({
  onClose,
  rightIcon,
  title,
}: {
  onClose: () => void;
  rightIcon?: ReactNode;
  title: string;
}) {
  return (
    <header className="ns-blue-header">
      <h1>{title}</h1>
      <button aria-label="닫기" className="ns-blue-header-close" onClick={onClose} type="button">
        {rightIcon ?? <X size={22} aria-hidden="true" />}
      </button>
    </header>
  );
}

function NsAvatar({ seed }: { seed: number }) {
  // Deterministic soft gradient placeholder (no external asset) standing in for the
  // illustrated avatars in the Figma frames.
  const hueA = (seed * 47) % 360;
  const hueB = (hueA + 40) % 360;

  return (
    <span
      aria-hidden="true"
      className="ns-avatar"
      style={{
        background: `linear-gradient(135deg, hsl(${hueA} 70% 88%), hsl(${hueB} 72% 78%))`,
      }}
    />
  );
}

function ChatbotBottomInput({ onSubmit, placeholder }: { onSubmit: (value: string) => void; placeholder: string }) {
  const [value, setValue] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    onSubmit(trimmed);
    setValue("");
  };

  return (
    <form className="ns-chat-input" onSubmit={handleSubmit}>
      <input
        aria-label="메시지 입력"
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <button aria-label="보내기" className="ns-chat-send" type="submit">
        <ArrowUp size={18} aria-hidden="true" />
      </button>
    </form>
  );
}

/** Minimal chatbot top bar: AIGA wordmark + 로그인 + 대화 목록 메뉴. */
function ChatbotHeader() {
  return (
    <header className="ns-chatbot-header">
      <button aria-label="뒤로" className="ns-icon-button" onClick={() => goBack("/")} type="button">
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <img className="ns-chatbot-logo" src="/aiga-wordmark.svg" alt="AIGA" height={18} width={70} />
      <div className="ns-chatbot-header-actions">
        <button className="ns-login-chip" onClick={() => navigate("/login")} type="button">
          로그인
        </button>
        <button
          aria-label="대화 목록"
          className="ns-icon-button"
          onClick={() => navigate("/chatbot/conversations")}
          type="button"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// AI 챗봇(의사찾기) — 웰컴 / 대화목록 / 대화  (Figma 4390:12977 / 12990 / 13007)
// ---------------------------------------------------------------------------

function ChatbotWelcomePage() {
  return (
    <div className="ns-page ns-chatbot-page">
      <ChatbotHeader />
      <main className="ns-chatbot-welcome">
        <div className="ns-chatbot-brand">
          <img src="/aiga-hero-logo.png" alt="AIGA" height={64} width={64} />
          <h2>
            안녕하세요, AIGA입니다.
            <br />
            <span className="ns-accent-blue">어디가 아프세요?</span>
          </h2>
        </div>

        <div className="ns-chatbot-intro">
          <p className="ns-chat-bubble ns-chat-bubble-bot">
            저는 주요 질환을 위주로 <strong>국내 상급 종합병원 전문의</strong>를 안내해드리는 AI
            어시스턴트입니다.
          </p>
          <p className="ns-chat-bubble ns-chat-bubble-bot">
            <strong className="ns-accent-blue">증상이나 질환명</strong> 등을 알려주시면 적합한 전문의를
            찾아드리겠습니다.
          </p>
        </div>
      </main>
      <ChatbotBottomInput
        onSubmit={() => navigate("/chatbot/c/new")}
        placeholder="폐암 수술 잘 하는 의사 찾아줘."
      />
    </div>
  );
}

type ConversationGroup = {
  items: { id: string; title: string }[];
  label: string;
};

const CONVERSATION_GROUPS: ConversationGroup[] = [
  {
    label: "오늘",
    items: [
      { id: "lung-1", title: "폐암 잘하는 의사 추천해줘" },
      { id: "lung-2", title: "폐암 수술 후기 정리해줘" },
    ],
  },
  {
    label: "2025.06.01",
    items: [
      { id: "thyroid-1", title: "갑상선암 명의 알려줘" },
      { id: "thyroid-2", title: "서울대병원 내분비내과 예약" },
    ],
  },
  {
    label: "2025.05.20",
    items: [
      { id: "spine-1", title: "허리 디스크 잘 보는 병원" },
      { id: "spine-2", title: "척추 수술 명의 추천" },
    ],
  },
];

function ChatbotConversationListPage() {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div className="ns-page ns-chatbot-list-page">
      <header className="ns-chatbot-list-header">
        <h1>대화 목록</h1>
        <button aria-label="닫기" className="ns-icon-button" onClick={() => goBack("/chatbot")} type="button">
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <main className="ns-conversation-list" onClick={() => setOpenMenuId(null)}>
        {CONVERSATION_GROUPS.map((group) => (
          <section className="ns-conversation-group" key={group.label}>
            <p className="ns-conversation-group-label">{group.label}</p>
            {group.items.map((item) => (
              <div className="ns-conversation-row" key={item.id}>
                <button
                  className="ns-conversation-title"
                  onClick={() => navigate(`/chatbot/c/${item.id}`)}
                  type="button"
                >
                  {item.title}
                </button>
                <div className="ns-conversation-menu-wrap">
                  <button
                    aria-label={`${item.title} 더보기`}
                    className="ns-icon-button ns-conversation-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId((current) => (current === item.id ? null : item.id));
                    }}
                    type="button"
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                  {openMenuId === item.id ? (
                    <div className="ns-conversation-menu" onClick={(event) => event.stopPropagation()}>
                      <button type="button">
                        <PencilLine size={16} aria-hidden="true" /> 수정하기
                      </button>
                      <button className="ns-menu-danger" type="button">
                        <Trash2 size={16} aria-hidden="true" /> 삭제하기
                      </button>
                      <button type="button">
                        <Flag size={16} aria-hidden="true" /> 신고하기
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

type ChatMessage =
  | { kind: "bot"; text: ReactNode }
  | { kind: "recommend"; doctors: { dept: string; hospital: string; name: string }[] }
  | { kind: "chips"; chips: string[] }
  | { kind: "user"; text: string };

const SEED_CHAT: ChatMessage[] = [
  {
    kind: "bot",
    text: "건강검진에서 신장 결절이 발견되셨군요. 사용하신 키워드에 맞춰 국내 상급 종합병원 전문의를 추천해 드립니다.",
  },
  {
    kind: "recommend",
    doctors: [
      { name: "김영민", hospital: "서울대학교병원", dept: "비뇨의학과" },
      { name: "김건강", hospital: "서울대학교병원", dept: "비뇨의학과" },
      { name: "김민수", hospital: "세브란스병원", dept: "비뇨의학과" },
    ],
  },
  { kind: "chips", chips: ["연세타원플러스병원", "공덕미라내과의원"] },
  { kind: "user", text: "폐암 수술 잘 하는 의사 찾아줘." },
];

function ChatbotChatPage({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_CHAT);

  const handleSend = (value: string) => {
    setMessages((current) => [
      ...current,
      { kind: "user", text: value },
      { kind: "bot", text: "입력하신 내용을 바탕으로 적합한 전문의를 찾고 있어요. 잠시만 기다려 주세요." },
    ]);
  };

  return (
    <div className="ns-page ns-chatbot-page" data-conversation={conversationId}>
      <ChatbotHeader />
      <main className="ns-chat-thread">
        {messages.map((message, index) => {
          if (message.kind === "user") {
            return (
              <p className="ns-chat-bubble ns-chat-bubble-user" key={index}>
                {message.text}
              </p>
            );
          }

          if (message.kind === "bot") {
            return (
              <div className="ns-chat-row" key={index}>
                <span aria-hidden="true" className="ns-chat-bot-mark">
                  <Bot size={16} />
                </span>
                <p className="ns-chat-bubble ns-chat-bubble-bot">{message.text}</p>
              </div>
            );
          }

          if (message.kind === "recommend") {
            return (
              <div className="ns-recommend-cards" key={index}>
                {message.doctors.map((doctor, doctorIndex) => (
                  <button
                    className="ns-recommend-card"
                    key={doctor.name}
                    onClick={() => navigate("/experts")}
                    type="button"
                  >
                    <NsAvatar seed={doctorIndex + 3} />
                    <strong>{doctor.name}</strong>
                    <span>{doctor.hospital}</span>
                    <span className="ns-recommend-dept">{doctor.dept}</span>
                  </button>
                ))}
              </div>
            );
          }

          return (
            <div className="ns-chat-chips" key={index}>
              {message.chips.map((chip) => (
                <button className="ns-chat-chip" key={chip} onClick={() => navigate("/experts")} type="button">
                  {chip}
                </button>
              ))}
            </div>
          );
        })}
      </main>
      <ChatbotBottomInput onSubmit={handleSend} placeholder="메시지를 입력해 주세요." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 명의 찾기 (Figma 4390:13162 / 검색 13245 / 결과없음 13213)
// ---------------------------------------------------------------------------

const EXPERT_CATEGORIES = ["암", "척추ㆍ관절", "심장ㆍ뇌혈관", "신경ㆍ정신", "호흡기"];
const EXPERT_SUBTAGS = ["폐암", "위암", "대장암", "갑상선암", "간암"];
const EXPERT_SORTS = ["환자 경험", "동료 의사 추천", "거리"];

type ExpertDoctor = {
  dept: string;
  distance: string;
  hospital: string;
  id: string;
  name: string;
  verified: boolean;
};

const EXPERT_DOCTORS: ExpertDoctor[] = [
  { id: "d1", name: "김건강", verified: true, hospital: "서울대학교병원", dept: "내분비대사내과", distance: "1.2km" },
  { id: "d2", name: "이서준", verified: false, hospital: "서울대학교병원", dept: "내분비대사내과", distance: "1.2km" },
  { id: "d3", name: "박도윤", verified: true, hospital: "서울대학교병원", dept: "내분비대사내과", distance: "1.2km" },
  { id: "d4", name: "최지우", verified: false, hospital: "서울대학교병원", dept: "내분비대사내과", distance: "1.2km" },
  { id: "d5", name: "정하은", verified: true, hospital: "서울대학교병원", dept: "내분비대사내과", distance: "1.2km" },
  { id: "d6", name: "강민재", verified: false, hospital: "서울대학교병원", dept: "내분비대사내과", distance: "1.2km" },
  { id: "d7", name: "윤서연", verified: true, hospital: "서울대학교병원", dept: "내분비대사내과", distance: "1.2km" },
];

const EXPERT_SUGGESTIONS = [
  { kind: "질환", label: "장" },
  { kind: "명의", label: "김장우", meta: "강남세브란스병원, 간담췌외과" },
  { kind: "질환", label: "장루" },
  { kind: "질환", label: "장" },
];

function ExpertsBottomNav() {
  return (
    <nav className="ns-bottom-nav" aria-label="하단 메뉴">
      <button onClick={() => navigate("/")} type="button">
        <House size={22} aria-hidden="true" />
        <span>홈</span>
      </button>
      <button onClick={() => navigate("/chatbot")} type="button">
        <Bot size={22} aria-hidden="true" />
        <span>AI 의사찾기</span>
      </button>
      <button className="active" onClick={() => navigate("/experts")} type="button">
        <Stethoscope size={22} aria-hidden="true" />
        <span>의사 검색</span>
      </button>
      <button onClick={() => navigate("/community")} type="button">
        <MessageCircle size={22} aria-hidden="true" />
        <span>커뮤니티</span>
      </button>
      <button onClick={() => navigate("/my")} type="button">
        <UserRound size={22} aria-hidden="true" />
        <span>MY</span>
      </button>
    </nav>
  );
}

function ExpertsPage() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState(EXPERT_CATEGORIES[0]);
  const [activeSubtag, setActiveSubtag] = useState(EXPERT_SUBTAGS[0]);
  const [activeSort, setActiveSort] = useState(EXPERT_SORTS[0]);

  // 명의 찾기 has no seeded results for arbitrary free-text (결과없음, 13213); the
  // default browse (13162) lists the recommended doctors. A non-empty query with the
  // search field committed drops into the empty state to demonstrate the no-result CTA.
  const showNoResults = query.trim().length > 0 && !focused;
  const doctors = showNoResults ? [] : EXPERT_DOCTORS;

  return (
    <div className="ns-page ns-experts-page">
      <NsBlueHeader
        onClose={() => goBack("/")}
        rightIcon={<Search size={22} aria-hidden="true" />}
        title="명의 찾기"
      />

      <div className="ns-experts-search">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="질환명, 병원명, 의사명 검색"
          onBlur={() => setFocused(false)}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="질환명, 병원명, 의사명 검색"
          type="text"
          value={query}
        />
        {query ? (
          <button aria-label="검색어 지우기" className="ns-experts-clear" onClick={() => setQuery("")} type="button">
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {focused && query ? (
        <ul className="ns-experts-suggestions">
          {EXPERT_SUGGESTIONS.map((suggestion, index) => (
            <li key={`${suggestion.label}-${index}`}>
              <button onMouseDown={() => navigate("/experts")} type="button">
                {suggestion.kind === "명의" ? (
                  <NsAvatar seed={index + 1} />
                ) : (
                  <span aria-hidden="true" className="ns-suggestion-icon">
                    <Search size={16} />
                  </span>
                )}
                <span className="ns-suggestion-label">{suggestion.label}</span>
                {suggestion.meta ? <span className="ns-suggestion-meta">{suggestion.meta}</span> : null}
                <span className={`ns-suggestion-tag ns-suggestion-tag-${suggestion.kind === "명의" ? "expert" : "condition"}`}>
                  {suggestion.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="ns-experts-tabs" role="tablist" aria-label="질환 분류">
            {EXPERT_CATEGORIES.map((category) => (
              <button
                aria-selected={category === activeCategory}
                className={category === activeCategory ? "active" : ""}
                key={category}
                onClick={() => setActiveCategory(category)}
                role="tab"
                type="button"
              >
                {category}
              </button>
            ))}
          </div>

          <div className="ns-experts-subtags">
            {EXPERT_SUBTAGS.map((tag) => (
              <button
                className={tag === activeSubtag ? "active" : ""}
                key={tag}
                onClick={() => setActiveSubtag(tag)}
                type="button"
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="ns-experts-count-row">
            <p className="ns-experts-count">
              총 <strong>{doctors.length}</strong>명
            </p>
            <div className="ns-experts-sorts">
              {EXPERT_SORTS.map((sort) => (
                <button
                  className={sort === activeSort ? "active" : ""}
                  key={sort}
                  onClick={() => setActiveSort(sort)}
                  type="button"
                >
                  {sort}
                </button>
              ))}
            </div>
          </div>

          {doctors.length > 0 ? (
            <ul className="ns-experts-doctors">
              {doctors.map((doctor, index) => (
                <li key={doctor.id}>
                  <button className="ns-doctor-row" onClick={() => navigate("/experts")} type="button">
                    <span className="ns-doctor-info">
                      <span className="ns-doctor-name">
                        {doctor.name}
                        {doctor.verified ? <span className="ns-doctor-verified">의사 인증</span> : null}
                      </span>
                      <span className="ns-doctor-hospital">{doctor.hospital}</span>
                      <span className="ns-doctor-meta">
                        {doctor.distance} · {doctor.dept}
                      </span>
                    </span>
                    <NsAvatar seed={index + 1} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ns-experts-empty">
              <div className="ns-experts-empty-art" aria-hidden="true">
                <Stethoscope size={40} />
              </div>
              <p className="ns-experts-empty-title">질환명, 병원명, 의사 이름이 정확한지 확인해 주세요.</p>
              <p className="ns-experts-empty-desc">검색어가 정확한지 확인하거나 다른 키워드로 검색해보세요.</p>
              <div className="ns-experts-empty-cta">
                <p>
                  원하는 의사를 못 찾으셨나요?
                  <br />
                  Aiga쳇봇에게 물어보시면 질환에 딱 맞는 명의를 찾을 수 있어요.
                </p>
                <button onClick={() => navigate("/chatbot")} type="button">
                  질문하기
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ExpertsBottomNav />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 공지사항 목록/보기 (Figma 4390:14036 / 14049)
// ---------------------------------------------------------------------------

type Notice = {
  body: string[];
  date: string;
  id: string;
  title: string;
};

const NOTICES: Notice[] = [
  {
    id: "server-check",
    title: "서버 점검 안내",
    date: "25.05.05",
    body: [
      "안녕하세요. (주)코리아메디케어입니다.",
      "베닥 서비스를 이용해주시고 아껴주시는 고객 여러분께 감사드리며, 베닥 서비스의 개인정보처리방침이 개정되어 시행됨을 안내드립니다.",
      "1. 주요 개정내용: 휴면 회원 전환기간 변경",
      "※ 개정된 개인정보 처리방침에 동의하지 않으시는 경우 앱 화면에서 회원탈퇴를 요청하실 수 있으며, 시행일 전까지 별도의 의사표시를 하지 않으시면 개정된 개인정보처리방침에 동의하신 것으로 간주합니다.",
      "회원 여러분께 더 좋은 서비스로 보답하겠습니다. 감사합니다.",
      "2. 시행일자 : 2024년 9월 27일(금)",
    ],
  },
  {
    id: "update-0601",
    title: "서비스 업데이트 안내",
    date: "2025.06.01",
    body: [
      "AIGA 서비스가 업데이트되었습니다.",
      "AI 의사찾기와 명의 찾기 기능이 새롭게 추가되어 질환에 맞는 상급 종합병원 전문의를 더 쉽게 찾을 수 있습니다.",
    ],
  },
  {
    id: "update-0520",
    title: "커뮤니티 이용 정책 안내",
    date: "2025.05.20",
    body: [
      "건강한 커뮤니티 문화를 위해 이용 정책이 개정되었습니다.",
      "부적절한 게시글 및 댓글은 사전 안내 없이 삭제될 수 있습니다.",
    ],
  },
  {
    id: "update-0510",
    title: "개인정보처리방침 개정 안내",
    date: "2025.05.10",
    body: ["개인정보처리방침이 개정되었습니다. 자세한 내용은 이용약관에서 확인하실 수 있습니다."],
  },
];

function NoticesPage() {
  return (
    <div className="ns-page ns-notices-page">
      <NsBlueHeader onClose={() => goBack("/")} title="공지사항" />
      {NOTICES.length > 0 ? (
        <ul className="ns-notice-list">
          {NOTICES.map((notice) => (
            <li key={notice.id}>
              <button className="ns-notice-row" onClick={() => navigate(`/notices/${notice.id}`)} type="button">
                <span className="ns-notice-title">{notice.title}</span>
                <span className="ns-notice-date">{notice.date}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ns-notice-empty">
          <span aria-hidden="true" className="ns-notice-empty-art">
            💛🩷
          </span>
          <p>공지사항이 없습니다</p>
        </div>
      )}
    </div>
  );
}

function NoticeDetailPage({ noticeId }: { noticeId: string }) {
  const notice = NOTICES.find((item) => item.id === noticeId);

  return (
    <div className="ns-page ns-notices-page">
      <NsBlueHeader onClose={() => goBack("/notices")} title="공지사항" />
      {notice ? (
        <article className="ns-notice-detail">
          <h2>{notice.title}</h2>
          <p className="ns-notice-detail-date">{notice.date}</p>
          <div className="ns-notice-detail-divider" />
          {notice.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          <button className="ns-notice-detail-link" onClick={() => navigate("/terms")} type="button">
            변경된 개인정보처리방침 : 바로 가기
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </article>
      ) : (
        <div className="ns-notice-empty">
          <p>공지사항을 찾을 수 없습니다</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 의견 보내기 (Figma 4390:14064)
// ---------------------------------------------------------------------------

function FeedbackPage() {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!message.trim()) {
      return;
    }

    setSent(true);
  };

  return (
    <div className="ns-page ns-feedback-page">
      <NsBlueHeader onClose={() => goBack("/")} title="의견 보내기" />
      <form className="ns-feedback-form" onSubmit={handleSubmit}>
        <p className="ns-feedback-title">서비스 이용 중 궁금하신 점이나 개선 의견을 보내주세요.</p>
        <textarea
          aria-label="의견 내용"
          onChange={(event) => {
            setMessage(event.target.value);
            setSent(false);
          }}
          placeholder="문의 내용을 자세하게 남겨주시면 빠른 답변에 도움이 됩니다."
          rows={7}
          value={message}
        />
        <button className="ns-feedback-submit" disabled={!message.trim()} type="submit">
          의견 보내기
        </button>
        {sent ? <p className="ns-feedback-sent" role="status">의견이 접수되었습니다. 감사합니다.</p> : null}

        <section className="ns-feedback-notice">
          <p className="ns-feedback-notice-title">안내 사항</p>
          <p>
            · 산업안전보건법에 따라 고객 응대 근로자 보호조치를 하고 있으며, 모든 문의는 기록으로 남습니다.
          </p>
        </section>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 이용약관 (Figma 4390:14071 ~ 14086)
// ---------------------------------------------------------------------------

const TERMS_ARTICLES: { paragraphs: string[]; title: string }[] = [
  {
    title: "제1조 (목적)",
    paragraphs: [
      "이 약관은 (주)코리아메디케어(이하 “회사”라 합니다)가 제공하는 코메디닷컴 등 인터넷 뉴스 및 콘텐츠 관련 제반 서비스(이하 “서비스”라 한다)를 이용함에 있어 회사와 이용자의 권리, 의무 및 책임 사항, 기타 필요한 사항을 규정하는데 목적이 있습니다.",
    ],
  },
  {
    title: "제2조 (정의)",
    paragraphs: [
      "이 약관에서 사용하는 용어의 뜻은 다음과 같습니다.",
      "① 회원 : 이 약관에 동의하여 이용자 아이디(ID) 및 비밀번호를 설정해서 서비스 이용계약을 체결한 이용자",
      "② 가입 : 회원이 되고자 하는 자가 이 약관에 동의하여 회사의 서비스 이용 신청 양식에 필요 정보를 기재하고, 서비스 이용계약을 청약해 회사의 승인을 얻는 것",
      "③ 아이디(ID) : 회원의 식별과 서비스 이용을 위해 회원이 설정하고 회사가 승인하여 등록된 이메일주소",
      "④ 비밀번호(Password) : 회원의 동일성 확인과 회원의 권익 및 비밀보호를 위해 회원 스스로가 설정한 문자와 숫자 등의 조합 정보",
    ],
  },
  {
    title: "제3조 (약관의 변경, 효력 등)",
    paragraphs: [
      "① 이 약관의 내용은 회사가 제공하는 서비스 초기 화면에 게시하거나 기타의 방법으로 공지하고, 이 약관에 동의한 이용자에게 그 효력이 발생합니다.",
      "② 회사는 필요한 경우 관련 법령을 위배하지 않는 범위 내에서 이 약관을 변경할 수 있습니다.",
    ],
  },
];

function TermsPage() {
  return (
    <div className="ns-page ns-terms-page">
      <NsBlueHeader onClose={() => goBack("/")} title="이용약관" />
      <article className="ns-terms-body">
        <h2 className="ns-terms-chapter">제1장 총칙</h2>
        {TERMS_ARTICLES.map((article) => (
          <section className="ns-terms-article" key={article.title}>
            <h3>{article.title}</h3>
            {article.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}

function NewScreenNotFound() {
  return (
    <div className="ns-page ns-notfound-page">
      <NsBlueHeader onClose={() => goBack("/")} title="AIGA" />
      <div className="ns-notice-empty">
        <p>페이지를 찾을 수 없습니다</p>
        <button className="ns-feedback-submit" onClick={() => navigate("/")} type="button">
          홈으로
        </button>
      </div>
    </div>
  );
}
