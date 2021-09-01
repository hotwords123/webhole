
import { API } from "./flows_api";

const LATEST_MESSAGE_KEY = '_LATEST_MESSAGE_ID';
const MAX_DISPLAY_COUNT = 9;

export function read_latest_id() {
  return parseInt(localStorage.getItem(LATEST_MESSAGE_KEY)) || 0;
}

export class PollingManager {
  constructor({ token }) {
    this.polling_timer = null;
    this.unread_count = 0;
    this.token = token;
    this.latest_messages = [];

    this.fetch_messages_bound = this.fetch_messages.bind(this);

    this.pubSubKey = PubSub.subscribe(
      "MessageCountShouldUpdate",
      (msg, params = {}) => this.update(params.messages, params.callback_key)
    );

    this.setup_timer();
  }

  cleanup() {
    this.clear_timer();
    PubSub.unsubscribe(this.pubSubKey);
  }

  setup_timer() {
    this.clear_timer();

    const interval = parseInt(config.polling_interval);
    if (interval > 0) {
      setInterval(this.fetch_messages_bound, interval * 1000);
      this.fetch_messages();
    }
  }

  clear_timer() {
    if (this.polling_timer) clearInterval(this.polling_timer);
  }

  async update(messages, latest_id = null) {
    const from_sidebar = latest_id !== null;
    const latest_cid_map = new Map();

    if (!from_sidebar) latest_id = read_latest_id();

    if (messages) {
      this.latest_messages = messages;

      if (from_sidebar) {
        const new_latest_id = messages.reduce(
          (x, msg) => Math.max(x, msg.id),
          read_latest_id(),
        );
        localStorage.setItem(LATEST_MESSAGE_KEY, new_latest_id);
      }
    } else {
      messages = this.latest_messages;
    }

    const get_latest_cid = async (pid) => {
      if (latest_cid_map.has(pid)) {
        return latest_cid_map.get(pid);
      } else {
        const result = await API.get_latest_visited_cid(pid);
        latest_cid_map.set(pid, result);
        return result;
      }
    };

    const is_new_message = async (msg) => {
      if (!latest_id || msg.id <= latest_id) return false;
      if (msg.pid && msg.cid) {
        const latest_cid = await get_latest_cid(msg.pid);
        return !latest_cid || msg.cid > latest_cid;
      }
      return true;
    };

    let count = 0;

    for (const msg of messages) {
      const is_new = await is_new_message(msg);
      if (is_new) count++;
      if (msg.variant) msg.variant.is_new = is_new;
    }

    count = Math.min(count, from_sidebar ? 0 : MAX_DISPLAY_COUNT);

    if (count !== this.unread_count) {
      this.unread_count = count;
      PubSub.publish("MessageCountUpdate", count);
    }

    return messages;
  }

  async fetch_messages() {
    if (this.unread_count > MAX_DISPLAY_COUNT) return;

    try {
      const json = await API.get_messages(1, this.token, true, read_latest_id());
      await this.update(json.data);
    } catch (err) {
      console.error(err);
    }
  }
}