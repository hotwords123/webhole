import React, { createRef, PureComponent } from 'react';
import { API } from './flows_api';
import { Time } from './Common';
import LazyLoad from './react-lazyload/src';

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
  '1': '系统消息',
  '2': '回复我的',
  '4': '我关注的'
};

// todo: allow refresh (top bar)
// todo (low): choose what to show

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
      latest_id: parseInt(localStorage.getItem(LATEST_MESSAGE_KEY)) || 0
    };
    this.root = createRef();
    this.on_scroll_bound = this.on_scroll.bind(this);
  }

  componentDidMount() {
    this.load_more_pages();
    this.root.current.parentNode.addEventListener("scroll", this.on_scroll_bound, false);
  }

  componentWillUnmount() {
    this.root.current.parentNode.removeEventListener("scroll", this.on_scroll_bound, false);
  }

  load_page(page) {
    if (this.state.loading_status === 'loading') return;
    if (page !== this.state.loaded_pages + 1 || this.state.all_loaded) return;
    this.setState(
      {
        loading_status: 'loading',
      },
      () => {
        // todo: add dot if new

        API.get_messages(page, this.props.token, false)
          .then((json) => {
            this.setState((prev, props) => {
              const visited = new Set(prev.messages.map(msg => msg.id));
              return {
                loading_status: 'done',
                loaded_pages: page,
                all_loaded: json.data.length === 0,
                messages: prev.messages.concat(json.data.filter(msg => !visited.has(msg.id)))
              };
            });
          })
          .catch((err) => {
            console.error(err);
            this.setState({
              loading_status: 'failed',
              error_msg: err.message
            });
          });
      },
    );
  }

  load_more_pages() {
    this.load_page(this.state.loaded_pages + 1);
  }

  on_scroll(evt) {
    const target = evt.target;
    const avail = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (avail < target.clientHeight) this.load_more_pages();
  }

  render() {
    return (
      <div ref={this.root} className="push-message-container">
        {this.state.messages.map((msg) => (
          <LazyLoad
            key={msg.id}
            offset={1500}
            height="5em"
            overflow={true}
            once={true}
          >
            <PushMessage msg={msg} />
          </LazyLoad>
        ))}
        {this.state.loading_status === 'done' && this.state.all_loaded &&
          <p className="box box-tip">没有更多消息了</p>
        }
        {this.state.loading_status === 'loading' &&
          <p className="box box-tip">加载中……</p>
        }
        {this.state.loading_status === 'failed' &&
          <div className="box box-tip">
            <p>加载失败：{this.state.error_msg}</p>
            <a onClick={() => this.load_more_pages()}>重新加载</a>
          </div>
        }
      </div>
    );
  }
}

class PushMessage extends PureComponent {
  render() {
    /** @type {PushMessageData} */
    const msg = this.props.msg;

    // todo: render markdown
    // todo: render related post

    return (
      <div className="box push-message-item" key={msg.timestamp}>
        <div className="box-header">
          <Time stamp={msg.timestamp} short={true} />
          <b>{msg.title}</b>
        </div>
        <div className="box-content">
          <pre>{msg.body}</pre>
        </div>
      </div>
    );
  }
}
