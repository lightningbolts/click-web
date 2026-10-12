"use client";

import {
  AnimatePresence,
  LazyMotion,
  domMax,
  m as motion,
} from "framer-motion";
import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import CompanionPanel from "./CompanionPanel";
import { PhoneChrome, WebChrome } from "./DeviceChrome";
import {
  INITIAL_CONNECTED_IDS,
  INITIAL_MESSAGES,
  INITIAL_RSVP_IDS,
  PLAYGROUND_PEOPLE,
  PLAYGROUND_EVENTS,
} from "./mockData";
import ConnectScene from "./scenes/ConnectScene";
import ClicksScene from "./scenes/ClicksScene";
import DashboardScene from "./scenes/DashboardScene";
import EventsScene from "./scenes/EventsScene";
import SettingsScene from "./scenes/SettingsScene";
import HomeScene from "./scenes/HomeScene";
import HubsScene from "./scenes/HubsScene";
import PlaygroundMap from "./PlaygroundMapLazy";
import type {
  ChatMessage,
  DashboardTab,
  DemoPlan,
  MemoryCapsule,
  PlaygroundScene,
  PlaygroundState,
} from "./types";

const SCENES: { id: PlaygroundScene; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "connect", label: "Connect" },
  { id: "events", label: "Events" },
  { id: "clicks", label: "Clicks" },
  { id: "map", label: "Map" },
  { id: "hubs", label: "Hubs" },
  { id: "settings", label: "Me" },
  { id: "dashboard", label: "Dashboard" },
];

const seedMemories: Record<string, MemoryCapsule> = {};
for (const person of PLAYGROUND_PEOPLE) {
  if (person.memory) seedMemories[person.id] = person.memory;
}

function LandingPlaygroundInner() {
  const [scene, setScene] = useState<PlaygroundScene>("home");
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("home");
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(
    () => new Set(INITIAL_CONNECTED_IDS),
  );
  const [rsvpIds, setRsvpIds] = useState<Set<string>>(
    () => new Set(INITIAL_RSVP_IDS),
  );
  const [routeIds, setRouteIds] = useState<Set<string>>(() => new Set());
  const [memories, setMemories] =
    useState<Record<string, MemoryCapsule>>(seedMemories);
  const [messages, setMessages] =
    useState<Record<string, ChatMessage[]>>(INITIAL_MESSAGES);
  const [announcement, setAnnouncement] = useState("");
  const [intents, setIntents] = useState<Set<string>>(
    () => new Set(["Coffee"]),
  );
  const [joinedHub, setJoinedHub] = useState(false);
  const [hubMessages, setHubMessages] = useState<string[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(
    PLAYGROUND_EVENTS[0].id,
  );
  const [resetVersion, setResetVersion] = useState(0);
  const [savedEventIds, setSavedEventIds] = useState<Set<string>>(
    () => new Set([PLAYGROUND_EVENTS[1].id]),
  );
  const [inboxTab, setInboxTab] =
    useState<PlaygroundState["inboxTab"]>("active");
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<string[]>([]);
  const [hubName, setHubName] = useState("Kane Hall community");
  const [hubMode, setHubMode] = useState<PlaygroundState["hubMode"]>("browse");
  const toggleSavedEvent = useCallback(
    (id: string) =>
      setSavedEventIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const createGroup = useCallback((name: string) => {
    if (name.trim()) {
      setGroupName(name.trim());
      setGroupMessages([]);
    }
  }, []);
  const sendGroupMessage = useCallback((text: string) => {
    if (text.trim()) setGroupMessages((prev) => [...prev, text.trim()]);
  }, []);
  const createHub = useCallback((name: string) => {
    if (name.trim()) {
      setHubName(name.trim());
      setJoinedHub(true);
      setHubMessages([]);
      setHubMode("browse");
    }
  }, []);
  const toggleIntent = useCallback((intent: string) => {
    setIntents((prev) => {
      const next = new Set(prev);
      if (next.has(intent)) next.delete(intent);
      else next.add(intent);
      return next;
    });
  }, []);
  const joinHub = useCallback(() => setJoinedHub(true), []);
  const sendHubMessage = useCallback((text: string) => {
    if (text.trim()) setHubMessages((prev) => [...prev, text.trim()]);
  }, []);

  const state: PlaygroundState = useMemo(
    () => ({
      connectedIds,
      rsvpIds,
      routeIds,
      memories,
      messages,
      openChatId,
      dashboardTab,
      intents,
      joinedHub,
      hubMessages,
      selectedEventId,
      savedEventIds,
      inboxTab,
      groupName,
      groupMessages,
      hubName,
      hubMode,
    }),
    [
      connectedIds,
      rsvpIds,
      routeIds,
      memories,
      messages,
      openChatId,
      dashboardTab,
      intents,
      joinedHub,
      hubMessages,
      selectedEventId,
      savedEventIds,
      inboxTab,
      groupName,
      groupMessages,
      hubName,
      hubMode,
    ],
  );

  const connectPerson = useCallback((id: string, memory: MemoryCapsule) => {
    setConnectedIds((prev) => new Set(prev).add(id));
    setMemories((prev) => ({ ...prev, [id]: memory }));
    setMessages((prev) => ({
      ...prev,
      [id]: prev[id] ?? [
        {
          id: `click-${id}`,
          from: "system",
          text: `You Clicked at ${memory.place}.`,
          time: "now",
        },
      ],
    }));
  }, []);

  const toggleRsvp = useCallback((eventId: string) => {
    setRsvpIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const toggleRoute = useCallback((eventId: string) => {
    setRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const sendMessage = useCallback((personId: string, text: string) => {
    const msg: ChatMessage = {
      id: `you-${Date.now()}`,
      from: "you",
      text,
      time: "now",
    };
    setMessages((prev) => ({
      ...prev,
      [personId]: [...(prev[personId] ?? []), msg],
    }));
  }, []);

  const sendPlan = useCallback(
    (personId: string, plan: Omit<DemoPlan, "going">) => {
      // Whoever proposes a plan is going (same rule as the app).
      const msg: ChatMessage = {
        id: `plan-${Date.now()}`,
        from: "you",
        text: `📅 ${plan.title} · ${plan.when} · 📍 ${plan.place}`,
        time: "now",
        plan: { ...plan, going: true },
      };
      setMessages((prev) => ({
        ...prev,
        [personId]: [...(prev[personId] ?? []), msg],
      }));
    },
    [],
  );

  const togglePlanGoing = useCallback((personId: string, messageId: string) => {
    setMessages((prev) => ({
      ...prev,
      [personId]: (prev[personId] ?? []).map((m) =>
        m.id === messageId && m.plan
          ? { ...m, plan: { ...m.plan, going: !m.plan.going } }
          : m,
      ),
    }));
  }, []);

  const goToScene = useCallback((next: PlaygroundScene) => {
    setScene(next);
  }, []);

  const actions = useMemo(
    () => ({
      connectPerson,
      toggleRsvp,
      toggleRoute,
      sendMessage,
      sendPlan,
      togglePlanGoing,
      setOpenChatId,
      setDashboardTab,
      setScene: goToScene,
      toggleIntent,
      joinHub,
      sendHubMessage,
      setSelectedEventId,
      toggleSavedEvent,
      setInboxTab,
      createGroup,
      sendGroupMessage,
      createHub,
      setHubMode,
    }),
    [
      connectPerson,
      toggleRsvp,
      toggleRoute,
      sendMessage,
      sendPlan,
      togglePlanGoing,
      goToScene,
      toggleIntent,
      joinHub,
      sendHubMessage,
      toggleSavedEvent,
      createGroup,
      sendGroupMessage,
      createHub,
    ],
  );

  const isPhone = scene !== "dashboard";

  const phoneNav =
    scene === "home" || scene === "events" || scene === "hubs"
      ? "home"
      : scene === "clicks"
        ? "clicks"
        : scene === "map"
          ? "map"
          : scene === "settings"
            ? "settings"
            : "add";

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = SCENES.findIndex((item) => item.id === scene);
    if (index < 0) return;
    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (index + 1) % SCENES.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = (index - 1 + SCENES.length) % SCENES.length;
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      nextIndex = event.key === "Home" ? 0 : SCENES.length - 1;
    } else return;
    const next = SCENES[nextIndex].id;
    setScene(next);
    document.getElementById(`playground-tab-${next}`)?.focus();
  };

  return (
    <div data-testid="landing-playground" className="w-full">
      <div
        role="tablist"
        aria-label="Product playground"
        onKeyDown={onTabKeyDown}
        className="mb-6 flex flex-wrap justify-center gap-2"
      >
        {SCENES.map((item) => {
          const selected = scene === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`playground-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`playground-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                setScene(item.id);
                if (item.id === "dashboard") setDashboardTab("home");
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                selected
                  ? "bg-action text-on-action"
                  : "border border-hairline bg-surface text-fg hover:bg-surface-raised"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`playground-panel-${scene}`}
        aria-labelledby={`playground-tab-${scene}`}
        className="flex flex-col gap-6 lg:flex-row lg:items-stretch"
      >
        {isPhone ? (
          <>
            <PhoneChrome
              key={`phone-${resetVersion}`}
              label="Click on iOS"
              activeNav={phoneNav}
              hideNav={scene === "clicks" && Boolean(openChatId)}
              onNav={(next) => {
                if (next === "map") setDashboardTab("map");
                if (next === "clicks") setDashboardTab("clicks");
                setScene(next);
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={scene}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  {scene === "home" ? (
                    <HomeScene state={state} actions={actions} phone />
                  ) : scene === "hubs" ? (
                    <HubsScene state={state} actions={actions} />
                  ) : scene === "events" ? (
                    <EventsScene
                      state={state}
                      actions={actions}
                      onAnnounce={setAnnouncement}
                      phone
                    />
                  ) : scene === "clicks" ? (
                    <ClicksScene state={state} actions={actions} />
                  ) : scene === "map" ? (
                    <div
                      className="h-full p-0"
                      data-testid="playground-scene-phone-map"
                    >
                      <PlaygroundMap
                        state={state}
                        actions={actions}
                        fill
                        phone
                      />
                    </div>
                  ) : scene === "settings" ? (
                    <SettingsScene />
                  ) : (
                    <ConnectScene
                      state={state}
                      actions={actions}
                      onAnnounce={setAnnouncement}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </PhoneChrome>
            <CompanionPanel
              key={`web-${resetVersion}`}
              state={state}
              actions={actions}
            />
          </>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-0 min-w-0 flex-1 self-stretch"
          >
            <WebChrome label="Click on the web" lockScroll>
              <DashboardScene state={state} actions={actions} />
            </WebChrome>
          </motion.div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="min-h-11 rounded-xl border-2 border-hairline px-4 py-2 text-sm font-semibold hover:bg-surface-raised"
          onClick={() => {
            setConnectedIds(new Set(INITIAL_CONNECTED_IDS));
            setRsvpIds(new Set(INITIAL_RSVP_IDS));
            setRouteIds(new Set());
            setMemories(seedMemories);
            setMessages(INITIAL_MESSAGES);
            setIntents(new Set(["Coffee"]));
            setJoinedHub(false);
            setHubMessages([]);
            setSavedEventIds(new Set([PLAYGROUND_EVENTS[1].id]));
            setInboxTab("active");
            setGroupName(null);
            setGroupMessages([]);
            setHubName("Kane Hall community");
            setHubMode("browse");
            setOpenChatId(null);
            setSelectedEventId(PLAYGROUND_EVENTS[0].id);
            setDashboardTab("home");
            setScene("home");
            setResetVersion((version) => version + 1);
            setAnnouncement("Demo reset. You’re back on Home.");
          }}
        >
          Reset demo
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

export default function LandingPlayground() {
  return (
    <LazyMotion features={domMax}>
      <LandingPlaygroundInner />
    </LazyMotion>
  );
}
