import React, { createRef, PureComponent } from 'react';
import { API } from './flows_api';
import { Time, HighlightedMarkdown } from './Common';
import LazyLoad from './react-lazyload/src';
import { FlowItemQuote, load_single_meta } from './Flows';
import './PushMessage.css';
import { ColorPicker } from './color_picker';

/**
 * @typedef {{
 *  id: number; // message id
 *  pid?: number; // post id
 *  cid?: number; // comment id
 *  timestamp: number;
 *  title: string; // eg. xxx replied #xxx
 *  body: string; // content
 *  type: number;
 * }} PushMessageData
 */

const LATEST_MESSAGE_KEY = '_LATEST_MESSAGE_ID';
const MESSAGE_TYPE_MAP = {
  1: '系统消息',
  2: '回复我的',
  4: '我关注的',
};

// todo: change icon to bell (control bar)
// todo (low): choose what to show

export function read_latest_id() {
  return parseInt(localStorage.getItem(LATEST_MESSAGE_KEY)) || 0;
}

export class PushMessageViewer extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      loading_status: 'idle',
      loaded_pages: 0,
      all_loaded: false,
      /** @type {PushMessageData[]} */
      messages: [],
      error_msg: null,
      latest_id: 0,
    };
    this.root = createRef();
    this.on_scroll_bound = this.on_scroll.bind(this);
    this.color_picker_map = new Map();
  }

  componentDidMount() {
    this.reload_all();
    this.root.current.parentNode.addEventListener(
      'scroll',
      this.on_scroll_bound,
      false,
    );
  }

  componentWillUnmount() {
    this.root.current.parentNode.removeEventListener(
      'scroll',
      this.on_scroll_bound,
      false,
    );
  }

  load_page(page) {
    if (this.state.loading_status === 'loading') return;
    if (page !== this.state.loaded_pages + 1 || this.state.all_loaded) return;
    this.setState(
      {
        loading_status: 'loading',
      },
      () => {
        API.get_messages(page, this.props.token, false)
          .then((json) => {
            this.setState((prev, props) => {
              const visited = new Set(prev.messages.map((msg) => msg.id));

              const latest_id = json.data.reduce(
                (x, msg) => Math.max(x, msg.id),
                read_latest_id(),
              );
              localStorage.setItem(LATEST_MESSAGE_KEY, latest_id);

              return {
                loading_status: 'done',
                loaded_pages: page,
                all_loaded: json.data.length === 0,
                messages: prev.messages.concat(
                  json.data.filter((msg) => !visited.has(msg.id)),
                ),
              };
            });
          })
          .catch((err) => {
            console.error(err);
            this.setState({
              loading_status: 'failed',
              error_msg: err.message,
            });
          });
      },
    );
  }

  load_more_pages() {
    this.load_page(this.state.loaded_pages + 1);
  }

  reload_all() {
    this.setState(
      {
        loaded_pages: 0,
        messages: [],
        latest_id: read_latest_id(),
      },
      () => this.load_more_pages(),
    );
  }

  on_scroll(evt) {
    const target = evt.target;
    const avail = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (avail < target.clientHeight) this.load_more_pages();
  }

  get_color_picker(pid) {
    const map = this.color_picker_map;
    if (map.has(pid)) {
      return map.get(pid);
    } else {
      const color_picker = new ColorPicker();
      map.set(pid, color_picker);
      return color_picker;
    }
  }

  render() {
    return (
      <div ref={this.root} className="push-message-container">
        <div className="box box-tip push-message-hover-bar">
          <a onClick={() => this.reload_all()}>
            <span className="icon icon-refresh" />
            <label>刷新</label>
          </a>
        </div>
        {this.state.messages.map((msg, index, list) => (
          <LazyLoad
            key={msg.id}
            offset={500}
            height="5em"
            overflow={true}
            once={true}
          >
            <PushMessage
              is_new={!!this.state.latest_id && msg.id > this.state.latest_id}
              msg={msg}
              token={this.props.token}
              show_sidebar={this.props.show_sidebar}
              color_picker={this.get_color_picker(msg.pid)}
              cascade={
                !!msg.pid &&
                index + 1 < list.length &&
                list[index + 1].pid === msg.pid
              }
            />
          </LazyLoad>
        ))}
        {this.state.loading_status === 'done' && this.state.all_loaded && (
          <p className="box box-tip">没有更多消息了</p>
        )}
        {this.state.loading_status === 'loading' && (
          <p className="box box-tip">加载中……</p>
        )}
        {this.state.loading_status === 'failed' && (
          <div className="box box-tip">
            <p>加载失败：{this.state.error_msg}</p>
            <a onClick={() => this.load_more_pages()}>重新加载</a>
          </div>
        )}
      </div>
    );
  }
}

class PushMessage extends PureComponent {
  render() {
    const show_pid = load_single_meta(
      this.props.show_sidebar,
      this.props.token,
    );

    /** @type {PushMessageData} */
    const msg = this.props.msg;
    let content,
      style = null;

    if (typeof msg.pid === 'number') {
      // markdown

      // an ugly way to figure out the author
      const result = msg.title.match(/^(.+)回复了树洞#(\d+)$/);
      const author = result ? result[1] : '';
      const colors = this.props.color_picker.get(author);

      content = (
        <HighlightedMarkdown
          author={'[' + author + ']'}
          text={msg.body}
          color_picker={this.props.color_picker}
          show_pid={show_pid}
        />
      );

      style = {
        '--box-bgcolor-light': colors[0],
        '--box-bgcolor-dark': colors[1],
      };
    } else {
      // plain text
      content = <pre>{msg.body}</pre>;
    }

    return (
      <div
        className={'push-message-item' + (this.props.cascade ? ' cascade' : '')}
      >
        <div key={msg.id} className="box push-message-detail" style={style}>
          {this.props.is_new && (
            <div className="flow-item-dot flow-item-dot-message" />
          )}
          <div className="box-header">
            <Time stamp={msg.timestamp} short={true} />
            <b>{msg.title}</b>
          </div>
          <div className="box-content">{content}</div>
        </div>
        {msg.pid && !this.props.cascade && (
          <FlowItemQuote
            pid={msg.pid}
            from_msg={true}
            show_sidebar={this.props.show_sidebar}
            token={this.props.token}
            search_param={''}
            color_picker={this.props.color_picker}
          />
        )}
      </div>
    );
  }
}
