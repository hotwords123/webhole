import React, { PureComponent } from 'react';
// import {AppSwitcher} from './infrastructure/widgets';
import { InfoSidebar, PostForm } from './UserAction';
import { TokenCtx } from './UserAction';

import './Title.css';
import { PushMessageViewer, read_latest_id } from './PushMessage';
import { API } from './flows_api';

const flag_re = /^\/\/setflag ([a-zA-Z0-9_]+)=(.*)$/;

class ControlBar extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      search_text: '',
      has_new_message: false,
    };
    this.set_mode = props.set_mode;

    this.polling_timer = null;

    this.on_change_bound = this.on_change.bind(this);
    this.on_keypress_bound = this.on_keypress.bind(this);
    this.do_refresh_bound = this.do_refresh.bind(this);
    this.do_attention_bound = this.do_attention.bind(this);
    this.do_hot_posts_bound = this.do_hot_posts.bind(this);
    this.fetch_messages_bound = this.fetch_messages.bind(this);
  }

  componentDidMount() {
    if (window.location.hash) {
      let text = decodeURIComponent(window.location.hash).substr(1);
      if (text.lastIndexOf('?') !== -1)
        text = text.substr(0, text.lastIndexOf('?')); // fuck wechat '#param?nsukey=...'
      this.setState(
        {
          search_text: text,
        },
        () => {
          this.on_keypress({ key: 'Enter' });
        },
      );
    }
    this.setup_polling_timer();
  }

  on_change(event) {
    this.setState({
      search_text: event.target.value,
    });
  }

  on_keypress(event) {
    if (event.key === 'Enter') {
      let flag_res = flag_re.exec(this.state.search_text);
      if (flag_res) {
        let r = confirm('Please confirm:\n' + this.state.search_text);
        if (r === true) {
          if (flag_res[2]) {
            localStorage[flag_res[1]] = flag_res[2];
            alert(
              'Set Flag ' +
                flag_res[1] +
                '=' +
                flag_res[2] +
                '\nYou may need to refresh this webpage.',
            );
          } else {
            delete localStorage[flag_res[1]];
            alert(
              'Clear Flag ' +
                flag_res[1] +
                '\nYou may need to refresh this webpage.',
            );
          }
        }
        return;
      }

      const mode = /#[0-9]+/.test(this.state.search_text)
        ? 'single'
        : this.props.mode !== 'attention'
        ? 'search'
        : 'attention';
      this.set_mode(mode, this.state.search_text || '');
    }
  }

  do_refresh() {
    window.scrollTo(0, 0);
    this.setState({
      search_text: '',
    });
    this.set_mode('list', null);
  }

  do_attention() {
    window.scrollTo(0, 0);
    this.setState({
      search_text: '',
    });
    this.set_mode('attention', null);
  }

  do_hot_posts() {
    window.scrollTo(0, 0);
    this.setState({
      search_text: '热榜',
    });
    this.set_mode('search', '热榜');
  }

  setup_polling_timer() {
    if (this.polling_timer)
      clearInterval(this.polling_timer);
    const interval = parseInt(config.polling_interval);
    if (interval > 0) {
      setInterval(this.fetch_messages_bound, interval * 1000);
      this.fetch_messages();
    }
  }

  fetch_messages() {
    console.info(this.props)
    if (this.state.has_new_message) return;
    API.get_messages(1, this.props.token, true)
      .then(json => {
        const prev_lastet_id = read_latest_id();
        const lastet_id = Math.max(...json.data.map(msg => msg.id));

        if (!!prev_lastet_id && lastet_id > prev_lastet_id) {
          this.setState({
            has_new_message: true
          });
        }
      })
      .catch(err => console.error('Failed to fetch messages', err));
  }

  render() {
    return (
      <TokenCtx.Consumer>
        {({ value: token }) => (
          <div className="control-bar">
            <a
              className="no-underline control-btn"
              onClick={this.do_refresh_bound}
            >
              <span className="icon icon-refresh" />
              <span className="control-btn-label">最新</span>
            </a>
            {!!token && (
              <a
                className="no-underline control-btn"
                onClick={this.do_attention_bound}
              >
                <span className="icon icon-attention" />
                <span className="control-btn-label">关注</span>
              </a>
            )}
            <a
              className="no-underline control-btn"
              onClick={this.do_hot_posts_bound}
            >
              <span className="icon icon-fire" />
              <span className="control-btn-label">热榜</span>
            </a>
            <input
              className="control-search"
              value={this.state.search_text}
              placeholder={`${
                this.props.mode === 'attention' ? '在关注列表中' : ''
              }搜索 或 #树洞号`}
              onChange={this.on_change_bound}
              onKeyPress={this.on_keypress_bound}
            />
            <a
              className="no-underline control-btn"
              onClick={() => {
                this.props.show_sidebar(
                  process.env.REACT_APP_TITLE,
                  <InfoSidebar show_sidebar={this.props.show_sidebar} />,
                );
              }}
            >
              <span className={'icon icon-' + (token ? 'about' : 'login')} />
              <span className="control-btn-label">
                {token ? '账户' : '登录'}
              </span>
            </a>
            {!!token && (
              <a
                className="no-underline control-btn"
                onClick={() => {
                  this.props.show_sidebar(
                    '发表树洞',
                    <PostForm
                      token={token}
                      action={'dopost'}
                      pid={'new_post'}
                      on_complete={() => {
                        this.props.show_sidebar(null, null, 'clear');
                        this.do_refresh();
                      }}
                    />,
                  );
                }}
              >
                <span className="icon icon-plus" />
                <span className="control-btn-label">发表</span>
              </a>
            )}
            {!!token && (
              /* use bell icon here, update icomoon */
              <a
                className="no-underline control-btn"
                onClick={() => {
                  this.setState({ has_new_message: false });
                  this.props.show_sidebar(
                    '消息列表',
                    <PushMessageViewer
                      token={token}
                      show_sidebar={this.props.show_sidebar}
                    />,
                  );
                }}
              >
                {this.state.has_new_message &&
                  <div className="control-btn-dot"></div>
                }
                <span className="icon icon-fire" />
                <span className="control-btn-label">消息</span>
              </a>
            )}
          </div>
        )}
      </TokenCtx.Consumer>
    );
  }
}

export function Title(props) {
  return (
    <div className="title-bar">
      {/* <AppSwitcher appid="hole" /> */}
      <div className="aux-margin">
        <div className="title">
          <p className="centered-line">
            <span
              onClick={() =>
                props.show_sidebar(
                  process.env.REACT_APP_TITLE,
                  <InfoSidebar show_sidebar={props.show_sidebar} />,
                )
              }
            >
              {process.env.REACT_APP_TITLE}
            </span>
          </p>
        </div>
        <TokenCtx.Consumer>
          {({ value: token }) => 
            <ControlBar
              show_sidebar={props.show_sidebar}
              set_mode={props.set_mode}
              mode={props.mode}
              token={token}
            /> 
          }
        </TokenCtx.Consumer>
      </div>
    </div>
  );
}
