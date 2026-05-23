import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import {
  MessageSquare, Plus, Search, Users, X, Send, ChevronLeft,
  Pencil, Trash2, Check, CheckCheck, MoreHorizontal,
} from "lucide-react";
import type { ConversationWithDetails, MessageWithSender, PublicUser } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function msgTime(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d))      return format(d, "h:mm a");
  if (isYesterday(d))  return "Yesterday";
  return format(d, "MMM d");
}

function fullTime(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy 'at' h:mm a");
}

function Avatar({ name, avatarUrl, size = 36, className = "" }: {
  name: string; avatarUrl: string | null; size?: number; className?: string;
}) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  if (avatarUrl) return (
    <img src={avatarUrl} alt={name}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={{ width: size, height: size }} />
  );
  return (
    <div
      className={`rounded-full bg-primary/20 text-primary font-semibold flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </div>
  );
}

// Conversation display name: for DMs, show the other person's name; for groups, show group name
function convName(conv: ConversationWithDetails, myId: number): string {
  if (conv.isGroup) return conv.name ?? "Group";
  const other = conv.participants.find(p => p.id !== myId);
  return other?.name ?? "Direct Message";
}

function convAvatar(conv: ConversationWithDetails, myId: number, size = 36) {
  if (conv.isGroup) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div className={`absolute inset-0 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400`}>
          <Users size={Math.round(size * 0.45)} />
        </div>
      </div>
    );
  }
  const other = conv.participants.find(p => p.id !== myId);
  if (!other) return null;
  return <Avatar name={other.name} avatarUrl={other.avatarUrl} size={size} />;
}

// ── New DM Dialog ─────────────────────────────────────────────────────────────

function NewDMDialog({ friends, onStart, onClose }: {
  friends: PublicUser[];
  onStart: (friendId: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = query
    ? friends.filter(f => f.name.toLowerCase().includes(query.toLowerCase()) || f.email.toLowerCase().includes(query.toLowerCase()))
    : friends;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare size={16} /> New Message
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search friends…"
            className="pl-8 h-9"
            autoFocus
          />
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No friends found</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filtered.map(f => (
              <button
                key={f.id}
                onClick={() => onStart(f.id)}
                className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-secondary/60 transition-colors text-left"
              >
                <Avatar name={f.name} avatarUrl={f.avatarUrl} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── New Group Dialog ──────────────────────────────────────────────────────────

function NewGroupDialog({ friends, onCreate, onClose }: {
  friends: PublicUser[];
  onCreate: (name: string, participantIds: number[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  const filtered = query
    ? friends.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
    : friends;

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={16} /> New Group
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Group name…"
            className="h-9"
            autoFocus
          />
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Add friends…"
              className="pl-8 h-9"
            />
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map(id => {
                const f = friends.find(x => x.id === id)!;
                return (
                  <span key={id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs rounded-full px-2.5 py-1">
                    {f.name.split(" ")[0]}
                    <button onClick={() => toggle(id)}><X size={11} /></button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filtered.map(f => (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                className={`flex items-center gap-3 w-full p-2 rounded-xl transition-colors text-left ${
                  selected.includes(f.id) ? "bg-primary/10" : "hover:bg-secondary/60"
                }`}
              >
                <Avatar name={f.name} avatarUrl={f.avatarUrl} size={30} />
                <span className="text-sm flex-1">{f.name}</span>
                {selected.includes(f.id) && <Check size={14} className="text-primary shrink-0" />}
              </button>
            ))}
          </div>

          <Button
            className="w-full gap-2"
            disabled={!name.trim() || selected.length === 0}
            onClick={() => onCreate(name.trim(), selected)}
          >
            <Users size={15} /> Create Group
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, showAvatar, onDelete }: {
  msg: MessageWithSender;
  isOwn: boolean;
  showAvatar: boolean;
  onDelete?: () => void;
}) {
  const [hover, setHover] = useState(false);

  if (msg.isDeleted) {
    return (
      <div className={`flex gap-2 my-0.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
        {!isOwn && <div style={{ width: 28 }} />}
        <p className="text-xs text-muted-foreground italic px-2">Message deleted</p>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-2 my-0.5 group items-end ${isOwn ? "flex-row-reverse" : "flex-row"}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Avatar placeholder (keeps alignment) */}
      {!isOwn && (
        showAvatar
          ? <Avatar name={msg.sender.name} avatarUrl={msg.sender.avatarUrl} size={28} className="mb-0.5 shrink-0" />
          : <div style={{ width: 28 }} className="shrink-0" />
      )}

      <div className={`flex flex-col max-w-[72%] ${isOwn ? "items-end" : "items-start"}`}>
        {showAvatar && !isOwn && (
          <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.sender.name}</p>
        )}
        <div className={`relative flex items-end gap-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
          <div
            className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
              isOwn
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-secondary text-foreground rounded-bl-sm"
            }`}
          >
            {msg.content}
          </div>
          {/* Delete button (own messages only) */}
          {isOwn && hover && onDelete && (
            <button
              onClick={onDelete}
              className="p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 px-1" title={fullTime(msg.createdAt)}>
          {msgTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ── Conversation List Item ────────────────────────────────────────────────────

function ConvItem({ conv, myId, active, onClick }: {
  conv: ConversationWithDetails;
  myId: number;
  active: boolean;
  onClick: () => void;
}) {
  const name = convName(conv, myId);
  const lastMsg = conv.lastMessage;
  const preview = lastMsg
    ? lastMsg.isDeleted
      ? "Message deleted"
      : lastMsg.sender.id === myId
        ? `You: ${lastMsg.content}`
        : lastMsg.content
    : "No messages yet";
  const time = lastMsg ? msgTime(lastMsg.createdAt) : "";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left hover:bg-secondary/60 ${
        active ? "bg-secondary border border-border" : ""
      }`}
    >
      <div className="shrink-0">{convAvatar(conv, myId, 40)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <p className={`text-sm truncate ${conv.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>{name}</p>
          <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className="text-xs text-muted-foreground truncate leading-tight">{preview}</p>
          {conv.unreadCount > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MessengerPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const myId = (user as any)?.id as number;

  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [showDMDialog, setShowDMDialog] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Data queries ────────────────────────────────────────────────────────────

  const { data: conversations = [] } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/messenger/conversations"],
    queryFn: async () => (await apiRequest("GET", "/api/messenger/conversations")).json(),
    refetchInterval: 8000,
  });

  const { data: friends = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/friends"],
    queryFn: async () => (await apiRequest("GET", "/api/friends")).json(),
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/messenger/conversations", activeConvId, "messages"],
    queryFn: async () => (await apiRequest("GET", `/api/messenger/conversations/${activeConvId}/messages?limit=100`)).json(),
    enabled: !!activeConvId,
    refetchInterval: 3000,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────

  const startDM = useMutation({
    mutationFn: (friendId: number) => apiRequest("POST", "/api/messenger/dm", { friendId }).then(r => r.json()),
    onSuccess: (conv: { id: number }) => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      openConversation(conv.id);
      setShowDMDialog(false);
    },
    onError: () => toast({ title: "Could not open conversation", variant: "destructive" }),
  });

  const createGroup = useMutation({
    mutationFn: ({ name, participantIds }: { name: string; participantIds: number[] }) =>
      apiRequest("POST", "/api/messenger/groups", { name, participantIds }).then(r => r.json()),
    onSuccess: (conv: { id: number }) => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      openConversation(conv.id);
      setShowGroupDialog(false);
    },
    onError: () => toast({ title: "Could not create group", variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/messenger/conversations/${activeConvId}/messages`, { content }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations", activeConvId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      setDraft("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const deleteMessage = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/messenger/messages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/messenger/conversations", activeConvId, "messages"] }),
  });

  const markRead = useCallback((convId: number) => {
    apiRequest("POST", `/api/messenger/conversations/${convId}/read`).then(() => {
      qc.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/messenger/unread-count"] });
    }).catch(() => {});
  }, [qc]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark as read when opening a conversation
  useEffect(() => {
    if (activeConvId) markRead(activeConvId);
  }, [activeConvId, messages.length]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  function openConversation(id: number) {
    setActiveConvId(id);
    setMobileView("chat");
    setDraft("");
  }

  function handleSend() {
    const content = draft.trim();
    if (!content || !activeConvId) return;
    sendMessage.mutate(content);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Filtered conversations ───────────────────────────────────────────────────

  const filteredConvs = conversations.filter(c => {
    if (!search) return true;
    const name = convName(c, myId).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-x-0 top-14 bottom-16 flex lg:static lg:inset-auto lg:h-screen">

      {/* ── Left: Conversation List ──────────────────────────────────────────── */}
      <div className={`flex flex-col border-r bg-card ${
        mobileView === "chat" ? "hidden md:flex" : "flex"
      } w-full md:w-80 lg:w-96 shrink-0`}>

        {/* Header */}
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare size={18} className="text-primary" /> Messenger
            </h1>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="New Group" onClick={() => setShowGroupDialog(true)}>
                <Users size={14} />
              </Button>
              <Button size="sm" className="h-8 w-8 p-0" title="New Message" onClick={() => setShowDMDialog(true)}>
                <Plus size={15} />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredConvs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <MessageSquare size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">{search ? "No conversations found" : "No messages yet"}</p>
              {!search && (
                <p className="text-xs mt-1">
                  <button className="text-primary hover:underline" onClick={() => setShowDMDialog(true)}>
                    Start a conversation
                  </button>
                </p>
              )}
            </div>
          ) : (
            filteredConvs.map(conv => (
              <ConvItem
                key={conv.id}
                conv={conv}
                myId={myId}
                active={conv.id === activeConvId}
                onClick={() => openConversation(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Chat Area ─────────────────────────────────────────────────── */}
      <div className={`flex flex-col flex-1 min-w-0 ${
        mobileView === "list" ? "hidden md:flex" : "flex"
      }`}>
        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b bg-card flex items-center gap-3">
              {/* Mobile back button */}
              <button
                className="md:hidden p-1.5 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setMobileView("list")}
              >
                <ChevronLeft size={18} />
              </button>

              {convAvatar(activeConv, myId, 38)}

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{convName(activeConv, myId)}</p>
                {activeConv.isGroup && (
                  <p className="text-xs text-muted-foreground truncate">
                    {activeConv.participants.map(p => p.name.split(" ")[0]).join(", ")}
                  </p>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-0">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare size={36} className="mb-3 opacity-20" />
                  <p className="text-sm">No messages yet</p>
                  <p className="text-xs mt-1">Be the first to say something!</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const prev = messages[i - 1];
                  // Show avatar only for the last message in a sequence from same sender
                  const next = messages[i + 1];
                  const showAvatar = !next || next.senderId !== msg.senderId;
                  return (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isOwn={msg.senderId === myId}
                      showAvatar={showAvatar}
                      onDelete={msg.senderId === myId ? () => deleteMessage.mutate(msg.id) : undefined}
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="px-4 py-3 border-t bg-card">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  className="flex-1 min-h-[40px] max-h-32 resize-none text-sm py-2 leading-snug"
                  rows={1}
                />
                <Button
                  size="sm"
                  className="h-10 w-10 p-0 shrink-0"
                  disabled={!draft.trim() || sendMessage.isPending}
                  onClick={handleSend}
                >
                  <Send size={15} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare size={28} className="text-primary/60" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Your messages</p>
              <p className="text-sm mt-1">Select a conversation or start a new one</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowDMDialog(true)}>
                <MessageSquare size={14} /> New Message
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowGroupDialog(true)}>
                <Users size={14} /> New Group
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      {showDMDialog && (
        <NewDMDialog
          friends={friends}
          onStart={friendId => startDM.mutate(friendId)}
          onClose={() => setShowDMDialog(false)}
        />
      )}
      {showGroupDialog && (
        <NewGroupDialog
          friends={friends}
          onCreate={(name, participantIds) => createGroup.mutate({ name, participantIds })}
          onClose={() => setShowGroupDialog(false)}
        />
      )}
    </div>
  );
}
