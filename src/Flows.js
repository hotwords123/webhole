import React, {
  Component,
  PureComponent,
  useContext,
  useState,
  useMemo,
  useEffect,
} from 'react';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import PubSub from 'pubsub-js';
import copy from 'copy-to-clipboard';
import ReactDOM from 'react-dom';
const { detect } = require('detect-browser');
const browser = detect();
import ImageSlides from 'react-imageslides';
import { API_ROOT } from './old_infrastructure/const';
import { ColorPicker } from './color_picker';
import {
  split_text,
  NICKNAME_RE,
  PID_RE,
  URL_RE,
  // URL_PID_RE,
} from './text_splitter';
import {
  format_time,
  Time,
  TitleLine,
  ClickHandler,
  ColoredSpan,
  HighlightedMarkdown,
  escape_regex,
} from './Common';
import './Flows.css';
import LazyLoad, { forceCheck } from './react-lazyload/src';
// import { AudioWidget } from './AudioWidget';
import { TokenCtx, ReplyForm, PostForm, DoUpdate } from './UserAction';
import { API, API_VERSION_PARAM, get_json } from './flows_api';
import { nanoid } from 'nanoid';
const ADMIN_COMMANDS = [
  'logs',
  'rep_dels',
  'rep_folds',
  'log_tags',
  'log_dels',
  'rep_recalls',
  'log_unbans',
  'msgs',
  'dels',
];
import { cache } from './cache';

// const process.env.REACT_APP_IMG_BASE_URL = 'https://thimg.yecdn.com/';
// const process.env.REACT_APP_IMG_BASE_BAK_URL = 'https://img2.thuhole.com/';
// const AUDIO_BASE=THUHOLE_API_ROOT+'services/thuhole/audios/';

const CLICKABLE_TAGS = { a: true, audio: true, button: true };
const PREVIEW_REPLY_COUNT = 10;
// const QUOTE_BLACKLIST=['23333','233333','66666','666666','10086','10000','100000','99999','999999','55555','555555'];
const QUOTE_BLACKLIST = [];

window.LATEST_POST_ID = parseInt(localStorage['_LATEST_POST_ID'], 10) || 0;
let not_show_deleted = false;

const DZ_NAME = '洞主';

const ImageComponent = (props) => (
  <p className="img">
    <img
      src={process.env.REACT_APP_IMG_BASE_URL + props.path}
      onError={(e) => {
        if (e.target.src === process.env.REACT_APP_IMG_BASE_URL + props.path) {
          e.target.src = process.env.REACT_APP_IMG_BASE_BAK_URL + props.path;
        }
      }}
      alt={process.env.REACT_APP_IMG_BASE_URL + props.path}
    />
  </p>
);

class ImageViewer extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      visible: false,
    };

    this.popup_anchor = document.getElementById('img_viewer');
    if (!this.popup_anchor) {
      this.popup_anchor = document.createElement('div');
      this.popup_anchor.id = 'img_viewer';
      document.body.appendChild(this.popup_anchor);
    }
  }

  render() {
    if (!this.props.in_sidebar) {
      return <ImageComponent path={this.props.url} />;
    }
    if (
      browser &&
      (browser.name === 'ios-webview' || browser.name === 'chromium-webview')
    ) {
      return (
        <div>
          <a
            className="no-underline"
            onClick={() => {
              this.setState({ visible: true });
            }}
            target="_blank"
          >
            <ImageComponent path={this.props.url} />
          </a>
          {this.state.visible &&
            ReactDOM.createPortal(
              <div>
                <ImageSlides
                  images={[process.env.REACT_APP_IMG_BASE_URL + this.props.url]}
                  isOpen
                  onClose={() => {
                    this.setState({ visible: false });
                  }}
                />
              </div>,
              this.popup_anchor,
            )}
        </div>
      );
    }
    return (
      <a
        className="no-underline"
        href={process.env.REACT_APP_IMG_BASE_URL + this.props.url}
        target="_blank"
      >
        <ImageComponent path={this.props.url} />
      </a>
    );
  }
}

export function load_single_meta(show_sidebar, token) {
  return (pid, replace = false) => {
    pid = parseInt(pid);
    let color_picker = new ColorPicker();
    let title_elem = '树洞 #' + pid;
    show_sidebar(
      title_elem,
      <div className="box box-tip">正在加载 #{pid}</div>,
      replace ? 'replace' : 'push',
    );
    API.load_replies(pid, token, color_picker)
      .then((json) => {
        show_sidebar(
          title_elem,
          <FlowSidebar
            key={+new Date()}
            info={json.post}
            replies={json.data}
            token={token}
            show_sidebar={show_sidebar}
            color_picker={color_picker}
          />,
          'replace',
        );
      })
      .catch((e) => {
        console.error(e);
        show_sidebar(
          title_elem,
          <div className="box box-tip">
            <p>
              <a
                onClick={() => load_single_meta(show_sidebar, token)(pid, true)}
              >
                重新加载
              </a>
            </p>
            <p>{'' + e}</p>
          </div>,
          'replace',
        );
      });
  };
}

function search_hit(txt, search_param) {
  new RegExp(
    `(${search_param
      .split(' ')
      .filter((x) => !!x)
      .map(escape_regex)
      .join('|')})`,
    'gi',
  ).test(txt);
  // return terms.filter((t) => t).some((term) => txt.indexOf(term) !== -1);
}

class Reply extends PureComponent {
  constructor(props) {
    super(props);
  }

  render() {
    if (
      this.props.info.deleted &&
      not_show_deleted &&
      !ADMIN_COMMANDS.includes(this.props.search_param)
    ) {
      return <></>;
    }

    let props = this.props;

    const author = '[' + this.props.info.name + ']',
      replyText = this.props.info.text;
    return (
      <div
        className={'flow-reply box'}
        style={
          this.props.info._display_color
            ? {
                '--box-bgcolor-light': this.props.info._display_color[0],
                '--box-bgcolor-dark': this.props.info._display_color[1],
              }
            : null
        }
      >
        <div className="box-header">
          {props.header_badges}
          <code className="box-id">#{this.props.info.cid}</code>
          &nbsp;
          {this.props.info.tag !== null && (
            <span className="box-header-tag">{this.props.info.tag}</span>
          )}
          <Time stamp={this.props.info.timestamp} short={false} />
        </div>
        {this.props.info.deleted && (
          <p key="deleted-hint" className="flow-variant-warning">
            （已删除）
          </p>
        )}
        {this.props.info.variant.report_widget && this.props.in_sidebar && (
          <ReportWidget
            key="report"
            info={props.info}
            is_reply={true}
            set_variant={props.set_variant}
          />
        )}
        <div className="box-content">
          <HighlightedMarkdown
            author={author}
            text={replyText}
            search_param={this.props.search_param}
            color_picker={this.props.color_picker}
            show_pid={this.props.show_pid}
          />
          {this.props.info.type === 'image' && (
            <ImageViewer
              in_sidebar={this.props.in_sidebar}
              url={this.props.info.url}
            />
          )}
        </div>
      </div>
    );
  }
}

function ReportWidget(props) {
  let [fold_reason, set_fold_reason] = useState('');
  let [tag_text, set_tag_text] = useState('others');

  function report(report_type) {
    const item_type = props.is_reply ? 'comment' : 'post';
    let id = props.is_reply ? props.info.cid : props.info.pid;

    let report_type_str = {
      fold: '举报折叠',
      delete: '删除',
      undelete_unban: '撤销删除',
      delete_ban: '删帖禁言',
      unban: '解封',
      set_tag: '打tag',
      report: '举报删除',
    }[report_type];
    let item_type_str = { post: '树洞', comment: '评论' }[item_type];

    let reason;
    switch (report_type) {
      case 'fold':
        reason = fold_reason;
        if (reason === 'select') return;
        if (
          !window.confirm(
            `确认因为 ${reason} 举报折叠 ${item_type_str} #${id} 吗？`,
          )
        )
          return;
        break;
      case 'set_tag':
        reason = tag_text;
        if (reason === 'select') return;
        if (reason === 'others') {
          reason = window.prompt(item_type_str + ' #' + id + ' 的tag：');
          if (!reason) return;
        }
        if (
          !window.confirm(`确认设置${item_type_str} #${id}的tag=${reason}吗？`)
        )
          return;
        break;
      case 'report':
      default:
        reason = window.prompt(
          `${report_type_str}` + item_type_str + ' #' + id + ' 的理由：',
        );
        if (!reason) return;
        if (
          !window.confirm(
            `确认因为 ${reason} 的理由 ${report_type_str} ${item_type_str} #${id} 吗？`,
          )
        )
          return;
        break;
    }

    let token = localStorage['TOKEN'];
    API.report(item_type, id, report_type, reason, token)
      .then((json) => {
        alert(`${report_type_str}成功`);
      })
      .catch((e) => {
        alert('举报失败：' + e);
        console.error(e);
      });
  }

  return (
    <div className="interactive flow-item-toolbar report-toolbar">
      {!props.info.permissions.includes('set_tag') &&
        props.info.permissions.includes('fold') && (
          <p>
            <button onClick={() => report('fold')}>折叠</button>
            <select
              value={fold_reason}
              onChange={(e) => set_fold_reason(e.target.value)}
            >
              <option value="select">选择理由……</option>
              {process.env.REACT_APP_REPORTABLE_TAGS.split(',').map(
                (tag, i) => (
                  <option key={i} value={tag}>
                    #{tag}
                  </option>
                ),
              )}
            </select>
          </p>
        )}
      {!props.info.permissions.includes('delete') &&
        !props.info.permissions.includes('undelete_unban') &&
        props.info.permissions.includes('report') && (
          <p>
            <button onClick={() => report('report')}>删除</button>
            <span className="report-reason">
              这条{props.is_reply ? '回复' : '树洞'}违反
              <a href={process.env.REACT_APP_RULES_URL} target="_blank">
                社区规范
              </a>
              ，应被禁止
            </span>
          </p>
        )}
      {props.info.permissions.includes('delete') && (
        <p>
          <button onClick={() => report('delete')}>
            {props.info.permissions.includes('delete_ban') ? '删除' : '撤回'}
          </button>
          <span className="report-reason">
            {props.info.permissions.includes('delete_ban')
              ? '没有禁言惩罚的删除。'
              : '树洞发送两分钟内可以撤回，不会禁言。'}
          </span>
        </p>
      )}
      {props.info.permissions.includes('undelete_unban') && (
        <p>
          <button onClick={() => report('undelete_unban')}>撤销删除</button>
          <span className="report-reason">
            撤销删除并解除禁言（如果存在禁言的话）
          </span>
        </p>
      )}
      {props.info.permissions.includes('delete_ban') && (
        <p>
          <button onClick={() => report('delete_ban')}>删帖禁言</button>
          <span className="report-reason">
            删除并禁言。删除理由会通知用户。
          </span>
        </p>
      )}
      {props.info.permissions.includes('unban') && (
        <p>
          <button onClick={() => report('unban')}>解封</button>
          <span className="report-reason">解封，但不撤销删除</span>
        </p>
      )}
      {props.info.permissions.includes('set_tag') && (
        <p>
          <button onClick={() => report('set_tag')}>打tag</button>
          <select
            value={tag_text}
            onChange={(e) => set_tag_text(e.target.value)}
          >
            <option value="select">选择理由……</option>
            {process.env.REACT_APP_REPORTABLE_TAGS.split(',').map((tag, i) => (
              <option key={i} value={tag}>
                #{tag}
              </option>
            ))}
            <option value="">无tag</option>
            <option value="others">其他</option>
          </select>
        </p>
      )}
    </div>
  );
}

class VoteShowBox extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      alreadyVote: false,
      yourVoteText: '',
      yourVoteIndex: null,
      totalCount: 0,
      eachNums: [],
      loading: false,
      vote_data: 0,
    };
    this.sendVoteOption = this.sendVote.bind(this);
  }
  componentDidMount() {
    const {
      voteOptions: { voted, vote_data },
    } = this.props;
    let totalCount = 0;
    let opIndex = 0;
    let yourVoteIndex = null;
    let eachNums = [];
    if (voted !== '') {
      for (let option in vote_data) {
        eachNums.push(vote_data[option]);
        totalCount += vote_data[option];
        if (voted === option) {
          yourVoteIndex = opIndex;
        }
        opIndex++;
      }
      this.setState({
        alreadyVote: true,
        yourVoteText: voted,
        yourVoteIndex,
        totalCount,
        eachNums,
      });
    }
  }
  sendVote(optionText) {
    let data = new URLSearchParams();
    let path = 'send/vote?';
    const { pid } = this.props;
    data.append('pid', pid);
    data.append('option', optionText);
    this.setState({ loading: true });
    // fetch发送
    fetch(API_ROOT + path + API_VERSION_PARAM(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        TOKEN: this.props.token,
      },
      body: data,
    })
      .then(get_json)
      .then((json) => {
        if (json.code !== 0) {
          if (json.msg) alert(json.msg);
          throw new Error(JSON.stringify(json));
        }
        // 投完票后从json中获取票数
        const { voted, vote_data } = json.vote;
        let totalCount = 0;
        let opIndex = 0;
        let yourVoteIndex = null;
        let eachNums = [];
        if (voted !== '') {
          for (let option in vote_data) {
            eachNums.push(vote_data[option]);
            totalCount += vote_data[option];
            if (voted === option) {
              yourVoteIndex = opIndex;
            }
            opIndex++;
          }
          this.setState({
            alreadyVote: true,
            yourVoteText: voted,
            loading: false,
            yourVoteIndex,
            totalCount,
            eachNums,
            vote_data,
          });
          // 通知FlowItemRow在点击后先刷新
          // 发送pid，限制某pid更新，不会波及到其他FlowItemRow
          PubSub.publish('VoteDoneClickFreshSideBarFirst', this.props.pid);
        }
      })
      .catch((e) => {
        console.error(e);
        alert('投票失败');
        this.setState({
          alreadyVote: false,
          loading: false,
        });
      });
  }
  render() {
    const {
      alreadyVote,
      eachNums,
      yourVoteIndex,
      totalCount,
      loading,
    } = this.state;
    let { vote_data } = this.state;
    if (vote_data == 0) {
      vote_data = this.props.voteOptions.vote_data;
    }
    const voteData = Object.keys(vote_data);
    const resultPile = [];
    const buttonPile = [];
    if (alreadyVote) {
      // 结果显示组
      voteData.map((voteSingle, index) => {
        resultPile.push(
          index == yourVoteIndex ? (
            <div
              key={nanoid()}
              className="div-shell"
              style={{ borderColor: '#ffe5d8' }}
            >
              <div className="div-background"></div>
              <div
                className="div-votedOptionBar"
                style={{ width: (eachNums[index] / totalCount) * 100 + '%' }}
              ></div>
              <div className="div-text">
                <p
                  className="p-voteDataShow"
                  style={{
                    left: '0.5em',
                    fontSize: voteSingle.length > 18 ? '12px' : '14px',
                  }}
                >
                  {voteSingle}
                </p>
                <p
                  className="p-voteDataShow-right"
                  style={{
                    right: '0.5em',
                    fontSize: eachNums[index] > 999 ? '12px' : '14px',
                  }}
                >
                  {eachNums[index]}
                </p>
                <span className="liu_area"></span>
              </div>
            </div>
          ) : (
            <div key={nanoid()} className="div-shell">
              <div className="div-background"></div>
              <div
                className="div-optionBar"
                style={{
                  width: (eachNums[index] / totalCount) * 100 + '%',
                  display: eachNums[index] == 0 ? 'none' : 'inline',
                }}
              ></div>
              <div className="div-text">
                <p
                  className="p-voteDataShow"
                  style={{
                    left: '0.5em',
                    fontSize: voteSingle.length > 18 ? '12px' : '14px',
                  }}
                >
                  {voteSingle}
                </p>
                <p
                  className="p-voteDataShow-right"
                  style={{
                    right: '0.5em',
                    fontSize: eachNums[index] > 999 ? '12px' : '14px',
                  }}
                >
                  {eachNums[index]}
                </p>
                <span className="liu_area"></span>
              </div>
            </div>
          ),
        );
      });
    } else {
      // 投票按钮组
      voteData.map((voteSingle, index) => {
        buttonPile.push(
          <button
            className="voteButton"
            key={index}
            onClick={(event) => {
              this.sendVoteOption(event.target.innerText);
            }}
          >
            {voteSingle}
          </button>,
        );
      });
    }
    if (loading) {
      return <p className="box box-tip">投票中……</p>;
    }
    return (
      <div>
        <hr />
        <div className="voteGroupPanel">
          {alreadyVote ? <div>{resultPile}</div> : <div>{buttonPile}</div>}
        </div>
      </div>
    );
  }
}

class FlowItem extends PureComponent {
  copy_link(event) {
    event.preventDefault();
    copy(
      `${event.target.href}${
        this.props.info.tag ? ' 【' + this.props.info.tag + '】' : ''
      }\n` +
        `${this.props.info.text}${
          this.props.info.type === 'image'
            ? ' [图片]'
            : this.props.info.type === 'audio'
            ? ' [语音]'
            : ''
        }\n` +
        `（${format_time(new Date(this.props.info.timestamp * 1000))} ${
          this.props.info.likenum
        }关注 ${this.props.info.reply}回复）\n` +
        `${
          this.props.info.vote && this.props.info.vote.vote_options
            ? '\n【投票】：' +
              this.props.info.vote.vote_options.map((v) => v).join('\n')
            : ''
        }\n` +
        this.props.replies
          .map(
            (r) =>
              (r.tag ? '【' + r.tag + '】' : '') +
              '[' +
              r.name +
              '] ' +
              r.text +
              (r.type === 'image' ? ' [图片]' : ''),
          )
          .join('\n'),
    );
  }

  render() {
    let props = this.props;
    let voteOptionNum = Object.keys(props.info.vote).length;
    return (
      <div
        className={
          'flow-item' +
          (props.is_quote ? ' flow-item-quote' : '') +
          (props.from_msg ? ' flow-item-compact' : '')
        }
      >
        {!!props.is_quote && (
          <div className="quote-tip black-outline">
            <div>
              <span className="icon icon-quote" />
            </div>
          </div>
        )}
        <div className="box">
          {!!window.LATEST_POST_ID && props.info.pid > window.LATEST_POST_ID ? (
            <div className="flow-item-dot flow-item-dot-post" />
          ) : props.info.variant.new_reply ? (
            <div className="flow-item-dot flow-item-dot-comment" />
          ) : null}
          <div className="box-header">
            {props.header_badges}
            <code className="box-id">
              <a
                href={'##' + props.info.pid}
                onClick={this.copy_link.bind(this)}
              >
                #{props.info.pid}
              </a>
            </code>
            &nbsp;
            {props.info.tag !== null && (
              <span className="box-header-tag">{props.info.tag}</span>
            )}
            <Time stamp={props.info.timestamp} short={!props.in_sidebar} />
          </div>
          {props.info.deleted && (
            <p key="deleted-hint" className="flow-variant-warning">
              （已删除）
            </p>
          )}
          {props.info.variant.report_widget && props.in_sidebar && (
            <ReportWidget
              key="report"
              info={props.info}
              is_reply={false}
              set_variant={props.set_variant}
            />
          )}
          <div className="box-content">
            <HighlightedMarkdown
              text={props.info.text}
              color_picker={props.color_picker}
              search_param={props.search_param}
              show_pid={props.show_pid}
            />
            {props.info.type === 'image' && (
              <ImageViewer in_sidebar={props.in_sidebar} url={props.info.url} />
            )}
          </div>
          {voteOptionNum !== 0 && (
            <VoteShowBox
              voteOptions={props.info.vote}
              // voteOptions={{vote_data:{第一个选项:300,第二个选项第二个选项:200,第三个选项第三个选项第三个选项:400,第四个选项第四个选项第四个选项:1000},voted:"第四个选项第四个选项第四个选项"}}
              pid={props.info.pid}
              token={this.props.token}
            />
          )}
          {!!(props.attention && props.info.variant.latest_reply) && (
            <p className="box-footer">
              最新回复{' '}
              <Time stamp={props.info.variant.latest_reply} short={false} />
            </p>
          )}
        </div>
      </div>
    );
  }
}

class FlowSidebar extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      info: props.info,
      replies: props.replies,
      loading_status: 'done',
      error_msg: null,
      filter_name: null,
      rev: !!this.props.reverse,
    };
    this.color_picker = props.color_picker;
    this.syncState = props.sync_state || (() => {});
    this.reply_ref = React.createRef();
    this.reply_to_ref = { reply_to: -1 };
  }
  componentDidMount() {
    if (this.props.freshFirst) {
      this.load_replies();
    }
  }
  set_variant(cid, variant) {
    this.setState(
      (prev) => {
        if (cid)
          return {
            replies: prev.replies.map((reply) => {
              if (reply.cid === cid)
                return Object.assign({}, reply, {
                  variant: Object.assign({}, reply.variant, variant),
                });
              else return reply;
            }),
          };
        else
          return {
            info: Object.assign({}, prev.info, {
              variant: Object.assign({}, prev.info.variant, variant),
            }),
          };
      },
      function () {
        this.syncState({
          info: this.state.info,
          replies: this.state.replies,
        });
      },
    );
  }

  load_replies() {
    this.setState({
      loading_status: 'loading',
      error_msg: null,
    });
    API.load_replies(this.state.info.pid, this.props.token, this.color_picker)
      .then((json) => {
        this.setState(
          {
            replies: json.data,
            info: json.post,
            loading_status: 'done',
            error_msg: null,
          },
          () => {
            this.syncState({
              replies: json.data,
              info: json.post,
            });
            if (json.data.length)
              this.set_variant(null, {
                latest_reply: Math.max.apply(
                  null,
                  this.state.replies.map((r) => r.timestamp),
                ),
              });
          },
        );
      })
      .catch((e) => {
        console.error(e);
        this.setState({
          replies: [],
          loading_status: 'done',
          error_msg: '' + e,
        });
      });
  }

  toggle_attention() {
    this.setState({
      loading_status: 'loading',
    });
    const next_attention = !this.state.info.attention;
    API.set_attention(this.state.info.pid, next_attention, this.props.token)
      .then((json) => {
        if (json.data.length)
          json.data.variant = {
            latest_reply: Math.max.apply(
              null,
              json.data.map((r) => r.timestamp),
            ),
          };
        else json.data.variant = {};

        this.setState({
          loading_status: 'done',
          info: json.data,
        });
        this.syncState({
          info: json.data,
        });
      })
      .catch((e) => {
        this.setState({
          loading_status: 'done',
        });
        alert('设置关注失败');
        console.error(e);
      });
  }

  set_filter_name(name) {
    this.setState((prevState) => ({
      filter_name: name === prevState.filter_name ? null : name,
    }));
  }

  toggle_rev() {
    this.setState((prevState) => ({
      rev: !prevState.rev,
    }));
  }

  show_reply_bar(name, reply_to, event) {
    this.reply_to_ref.reply_to = reply_to;
    if (
      this.reply_ref.current &&
      !event.target.closest('a, .clickable, .interactive')
    ) {
      let text = this.reply_ref.current.get();
      if (
        /^\s*(?:Re (?:|洞主|(?:[A-Z][a-z]+ )?(?:[A-Z][a-z]+)|You Win(?: \d+)?):)?\s*$/.test(
          text,
        )
      ) {
        // text is nearly empty so we can replace it
        let should_text = 'Re ' + name + ': ';
        if (should_text === this.reply_ref.current.get())
          this.reply_ref.current.set('');
        else this.reply_ref.current.set(should_text);
      }
    }
  }

  render_self() {
    if (this.state.loading_status === 'loading')
      return <p className="box box-tip">加载中……</p>;

    let show_pid = load_single_meta(this.props.show_sidebar, this.props.token);

    let replies_to_show = this.state.filter_name
      ? this.state.replies.filter((r) => r.name === this.state.filter_name)
      : this.state.replies.slice();
    if (this.state.rev) replies_to_show.reverse();

    // key for lazyload elem
    let view_mode_key =
      (this.state.rev ? 'y-' : 'n-') + (this.state.filter_name || 'null');

    let replies_cnt = { [DZ_NAME]: 1 };
    replies_to_show.forEach((r) => {
      if (replies_cnt[r.name] === undefined) replies_cnt[r.name] = 0;
      replies_cnt[r.name]++;
    });

    // hide main thread when filtered
    let main_thread_elem =
      this.state.filter_name && this.state.filter_name !== DZ_NAME ? null : (
        <ClickHandler
          callback={(e) => {
            this.show_reply_bar('', -1, e);
          }}
        >
          <FlowItem
            token={this.props.token}
            info={this.state.info}
            in_sidebar={true}
            color_picker={this.color_picker}
            show_pid={show_pid}
            replies={this.state.replies}
            set_variant={(variant) => {
              this.set_variant(null, variant);
            }}
            header_badges={
              <>
                {this.state.info.permissions.length > 0 &&
                  (!this.state.info.variant.report_widget ? (
                    <span
                      className="reply-header-badge clickable"
                      onClick={() => {
                        this.set_variant(null, { report_widget: true });
                      }}
                    >
                      <span className="icon icon-flag" />
                      <label>
                        {this.state.info.permissions.includes('delete') &&
                        !this.state.info.permissions.includes('delete_ban')
                          ? '撤回'
                          : '举报'}
                      </label>
                    </span>
                  ) : (
                    <span
                      className="reply-header-badge clickable"
                      onClick={() => {
                        this.set_variant(null, { report_widget: false });
                      }}
                    >
                      <span className="icon icon-flag" />
                      <label>取消</label>
                    </span>
                  ))}
                {replies_cnt[DZ_NAME] > 1 && (
                  <span
                    className="reply-header-badge clickable"
                    onClick={() => {
                      this.set_filter_name(DZ_NAME);
                    }}
                  >
                    <span className="icon icon-locate" />
                    <label>只看</label>
                  </span>
                )}
              </>
            }
          />
        </ClickHandler>
      );

    return (
      <div className="flow-item-row sidebar-flow-item">
        <div className="box box-tip">
          <a onClick={this.load_replies.bind(this)}>
            <span className="icon icon-refresh" />
            <label>刷新</label>
          </a>
          {(this.state.replies.length >= 1 || this.state.rev) && (
            <span>
              &nbsp;&nbsp;
              <a onClick={this.toggle_rev.bind(this)}>
                <span
                  className={
                    'icon icon-order-rev' + (this.state.rev ? '-down' : '')
                  }
                />
                <label>{this.state.info.reply} 回复</label>
              </a>
            </span>
          )}
          &nbsp;&nbsp;
          <a
            onClick={() => {
              this.toggle_attention();
            }}
          >
            <span>
              <span
                className={
                  'icon icon-star' + (this.state.info.attention ? '-ok' : '')
                }
              />
              <label>{this.state.info.likenum} 关注</label>
            </span>
          </a>
        </div>
        {!!this.state.filter_name && (
          <div className="box box-tip flow-item filter-name-bar">
            <p>
              <span style={{ float: 'left' }}>
                <a
                  onClick={() => {
                    this.set_filter_name(null);
                  }}
                >
                  还原
                </a>
              </span>
              <span className="icon icon-locate" />
              &nbsp;当前只看&nbsp;
              <ColoredSpan
                colors={this.color_picker.get(this.state.filter_name)}
              >
                {this.state.filter_name}
              </ColoredSpan>
            </p>
          </div>
        )}
        {!this.state.rev && main_thread_elem}
        {!!this.state.error_msg && (
          <div className="box box-tip flow-item">
            <p>回复加载失败</p>
            <p>{this.state.error_msg}</p>
          </div>
        )}
        {replies_to_show.map((reply, i) => (
          <LazyLoad
            key={i}
            offset={1500}
            height="5em"
            overflow={true}
            once={true}
          >
            <ClickHandler
              callback={(e) => {
                this.show_reply_bar(reply.name, reply.cid, e);
              }}
            >
              <Reply
                info={reply}
                color_picker={this.color_picker}
                show_pid={show_pid}
                in_sidebar={true}
                set_variant={(variant) => {
                  this.set_variant(reply.cid, variant);
                }}
                header_badges={
                  <>
                    {reply.permissions.length > 0 &&
                      (!reply.variant.report_widget ? (
                        <span
                          className="reply-header-badge clickable"
                          onClick={() => {
                            this.set_variant(reply.cid, {
                              report_widget: true,
                            });
                          }}
                        >
                          <span className="icon icon-flag" />
                          {/*<label>举报</label>*/}
                        </span>
                      ) : (
                        <span
                          className="reply-header-badge clickable"
                          onClick={() => {
                            this.set_variant(reply.cid, {
                              report_widget: false,
                            });
                          }}
                        >
                          <span className="icon icon-flag" />
                          <label>取消</label>
                        </span>
                      ))}
                    {replies_cnt[reply.name] > 1 && (
                      <span
                        className="reply-header-badge clickable"
                        onClick={() => {
                          this.set_filter_name(reply.name);
                        }}
                      >
                        <span className="icon icon-locate" />
                        {/*<label>只看</label>*/}
                      </span>
                    )}
                  </>
                }
              />
            </ClickHandler>
          </LazyLoad>
        ))}
        {this.state.rev && main_thread_elem}
        {this.props.token ? (
          <PostForm
            pid={this.state.info.pid}
            token={this.props.token}
            action={'docomment'}
            area_ref={this.reply_ref}
            reply_to_ref={this.reply_to_ref}
            on_complete={this.load_replies.bind(this)}
          />
        ) : (
          <div className="box box-tip flow-item">登录后可以回复树洞</div>
        )}
      </div>
    );
  }

  render() {
    return (
      <SwitchTransition mode="out-in">
        <CSSTransition
          key={this.state.loading_status}
          timeout={100}
          classNames="flows-anim"
          appear={true}
        >
          {this.render_self()}
        </CSSTransition>
      </SwitchTransition>
    );
  }
}

class FlowItemRow extends PureComponent {
  constructor(props) {
    super(props);
    this.needFold =
      process.env.REACT_APP_FOLD_TAGS.split(',').indexOf(props.info.tag) > -1 &&
      (props.search_param === '热榜' || !props.search_param) &&
      !ADMIN_COMMANDS.includes(props.search_param) &&
      window.config.fold &&
      !props.info.attention;
    this.state = {
      freshFirst: false,
      replies: props.replies || [],
      reply_status: 'done',
      reply_error: null,
      info: Object.assign({}, props.info, { variant: {} }),
      hidden:
        window.config.block_words.some((word) =>
          props.info.text.includes(word),
        ) || this.needFold,
    };
    this.color_picker = this.props.color_picker || new ColorPicker();
    this.pubSubToken = PubSub.subscribe(
      'VoteDoneClickFreshSideBarFirst',
      this.handleFreshForVote.bind(this),
    );
  }
  handleFreshForVote(msg, data) {
    if (this.props.info.pid == data) {
      this.setState({ freshFirst: true });
    }
  }
  componentWillUnmount() {
    PubSub.unsubscribe(this.pubSubToken);
  }
  componentDidMount() {
    if (
      this.state.info.reply &&
      this.state.replies.length === 0 &&
      !this.state.info.comments
    ) {
      this.load_replies(null, /*update_post=*/ false);
    } else if (this.state.info.comments) {
      this.setState({
        replies: this.state.info.comments.map((info) => {
          info._display_color = this.color_picker.get(info.name);
          return info;
        }),
        freshFirst: this.state.info.comments.length !== this.state.info.reply,
      });
    }
  }

  load_replies(callback, update_post = true) {
    console.log('fetching reply', this.state.info.pid);
    this.setState({
      reply_status: 'loading',
      reply_error: null,
    });
    API.load_replies_with_cache(
      this.state.info.pid,
      this.props.token,
      this.color_picker,
      this.state.info.updated_at,
    )
      .then((json) => {
        this.setState(
          (prev) => ({
            replies: json.data,
            info: {
              ...(update_post ? json.post : prev.info),
              variant: {
                ...(prev.info.variant || {}),
                ...json.post.variant,
                latest_reply: Math.max.apply(
                  null,
                  json.data.map((r) => r.timestamp),
                ),
              },
            },
            reply_status: 'done',
            reply_error: null,
          }),
          callback,
        );
      })
      .catch((e) => {
        console.error(e);
        this.setState(
          {
            replies: [],
            reply_status: 'failed',
            reply_error: '' + e,
          },
          callback,
        );
      });
  }

  show_sidebar(freshFirst) {
    this.props.show_sidebar(
      '树洞 #' + this.state.info.pid,
      <FlowSidebar
        key={+new Date()}
        info={this.state.info}
        replies={this.state.replies}
        sync_state={this.setState.bind(this)}
        token={this.props.token}
        show_sidebar={this.props.show_sidebar}
        color_picker={this.color_picker}
        freshFirst={freshFirst}
        reverse={config.auto_order && this.props.from_msg}
      />,
    );
  }

  render() {
    if (
      this.state.info.deleted &&
      not_show_deleted &&
      !ADMIN_COMMANDS.includes(this.props.search_param)
    ) {
      return <></>;
    }

    let show_pid = load_single_meta(this.props.show_sidebar, this.props.token, [
      this.state.info.pid,
    ]);

    let hl_rules = [
      ['url', URL_RE],
      ['pid', PID_RE],
      ['nickname', NICKNAME_RE],
    ];
    let parts = split_text(this.state.info.text, hl_rules);

    let quote_id = null;
    if (!this.props.is_quote)
      for (let [mode, content] of parts) {
        content = content.length > 0 ? content.substring(1) : content;
        if (
          mode === 'pid' &&
          QUOTE_BLACKLIST.indexOf(content) === -1 &&
          (parseInt(content) < parseInt(this.state.info.pid) ||
            ADMIN_COMMANDS.includes(this.props.search_param))
        )
          if (quote_id === null) quote_id = parseInt(content);
          else {
            quote_id = null;
            break;
          }
      }

    let showing_replies;
    let shown_results = 0;
    if (this.props.from_msg) {
      showing_replies = [];
    } else if (
      !this.props.is_quote &&
      this.props.search_param &&
      this.props.search_param !== '' + this.state.info.pid &&
      this.props.search_param !== '热榜' &&
      this.props.search_param.charAt(0) !== '#'
    ) {
      // filter replies based on search param
      let search_reg = new RegExp(
        `(${this.props.search_param
          .split(' ')
          .filter((x) => !!x)
          .map(escape_regex)
          .join('|')})`,
        'gi',
      );
      showing_replies = this.state.replies
        .map((reply) => {
          if (shown_results >= PREVIEW_REPLY_COUNT) return null;
          if (
            search_reg.test(reply.text) ||
            (reply.deleted && this.props.search_param === 'dels')
          ) {
            shown_results++;
            return (
              <Reply
                key={reply.cid}
                info={reply}
                color_picker={this.color_picker}
                search_param={this.props.search_param}
                show_pid={show_pid}
                header_badges={null}
                in_sidebar={false}
                set_variant={(v) => {}}
              />
            );
          } else return null;
        })
        .filter((x) => x !== null);
    } // show all replies
    else {
      shown_results =
        this.state.replies.length > PREVIEW_REPLY_COUNT
          ? PREVIEW_REPLY_COUNT
          : this.state.replies.length;
      showing_replies = this.state.replies
        .slice(0, PREVIEW_REPLY_COUNT)
        .map((reply) => (
          <Reply
            key={reply.cid}
            info={reply}
            color_picker={this.color_picker}
            search_param={this.props.search_param}
            show_pid={show_pid}
            header_badges={null}
            in_sidebar={false}
            set_variant={(v) => {}}
          />
        ));
    }

    let res = (
      <div
        className={
          'flow-item-row flow-item-row-with-prompt' +
          (this.props.is_quote ? ' flow-item-row-quote' : '')
        }
        onClick={(e) => {
          if (!CLICKABLE_TAGS[e.target.tagName.toLowerCase()]) {
            // 如果需要售出刷新就发送信号
            if (this.state.freshFirst) {
              this.show_sidebar(true);
              this.setState({ freshFirst: false });
            } else {
              this.show_sidebar(false);
            }
          }
        }}
      >
        <FlowItem
          info={this.state.info}
          in_sidebar={false}
          is_quote={this.props.is_quote}
          from_msg={this.props.from_msg}
          color_picker={this.color_picker}
          search_param={this.props.search_param}
          show_pid={show_pid}
          replies={this.state.replies}
          set_variant={(v) => {}}
          token={this.props.token}
          header_badges={
            <>
              {!!this.state.info.likenum && (
                <span className="box-header-badge">
                  {this.state.info.likenum}&nbsp;
                  <span
                    className={
                      'icon icon-' +
                      (this.state.info.attention ? 'star-ok' : 'star')
                    }
                  />
                </span>
              )}
              {!!this.state.info.reply && (
                <span className="box-header-badge">
                  {this.state.info.reply}&nbsp;
                  <span className="icon icon-reply" />
                </span>
              )}
            </>
          }
        />
        {!this.props.from_msg && (
          <div className="flow-reply-row">
            {this.state.reply_status === 'loading' && (
              <div className="box box-tip">加载中</div>
            )}
            {this.state.reply_status === 'failed' && (
              <div className="box box-tip">
                <p>
                  <a
                    onClick={() => {
                      this.load_replies();
                    }}
                  >
                    重新加载评论
                  </a>
                </p>
                <p>{this.state.reply_error}</p>
              </div>
            )}
            {showing_replies}
            {this.state.info.reply > shown_results && (
              <div className="box box-tip">
                还有 {this.state.info.reply - shown_results} 条
              </div>
            )}
          </div>
        )}
      </div>
    );

    if (this.state.hidden) {
      return (
        <div
          className="flow-item-row flow-item-row-with-prompt"
          onClick={(event) => {
            if (!CLICKABLE_TAGS[event.target.tagName.toLowerCase()])
              this.show_sidebar(this.state.freshFirst);
          }}
        >
          <div
            className={
              'flow-item' + (this.props.is_quote ? ' flow-item-quote' : '')
            }
          >
            {!!this.props.is_quote && (
              <div className="quote-tip black-outline">
                <div>
                  <span className="icon icon-quote" />
                </div>
                {/*<div>*/}
                {/*  <small>提到</small>*/}
                {/*</div>*/}
              </div>
            )}
            <div className="box">
              <div className="box-header">
                <code className="box-id">#{this.props.info.pid}</code>
                &nbsp;
                {this.props.info.tag !== null && (
                  <span className="box-header-tag">{this.props.info.tag}</span>
                )}
                <Time stamp={this.props.info.timestamp} short={true} />
                <span className="box-header-badge">
                  {this.needFold ? '已隐藏' : '已屏蔽'}
                </span>
                <div style={{ clear: 'both' }} />
              </div>
            </div>
          </div>
        </div>
      );
    }

    return quote_id ? (
      <div>
        {res}
        <FlowItemQuote
          pid={quote_id}
          show_sidebar={this.props.show_sidebar}
          token={this.props.token}
          search_param={this.props.search_param}
        />
      </div>
    ) : (
      res
    );
  }
}

export class FlowItemQuote extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      loading_status: 'empty',
      error_msg: null,
      info: null,
    };
    this.color_picker = this.props.color_picker || new ColorPicker();
  }

  componentDidMount() {
    this.load();
  }

  load() {
    this.setState(
      {
        loading_status: 'loading',
      },
      () => {
        API.load_post(this.props.pid, this.props.token)
          .then((json) => {
            this.setState({
              loading_status: 'done',
              info: json,
            });
          })
          .catch((err) => {
            if (('' + err).indexOf('找不到这条树洞') !== -1 && !this.props.from_msg)
              this.setState({
                loading_status: 'empty',
              });
            else
              this.setState({
                loading_status: 'error',
                error_msg: '' + err,
              });
          });
      },
    );
  }

  render() {
    if (this.state.loading_status === 'empty') return null;
    else if (this.state.loading_status === 'loading')
      return (
        <div className="aux-margin">
          <div className="box box-tip">
            <span className="icon icon-loading" />
            提到了 #{this.props.pid}
          </div>
        </div>
      );
    else if (this.state.loading_status === 'error')
      return (
        <div className="aux-margin">
          <div className="box box-tip">
            <p>
              <a onClick={this.load.bind(this)}>重新加载</a>
            </p>
            <p>{this.state.error_msg}</p>
          </div>
        </div>
      );
    // 'done'
    else
      return (
        <FlowItemRow
          info={this.state.info.post}
          replies={this.state.info.data}
          color_picker={this.color_picker}
          show_sidebar={this.props.show_sidebar}
          search_param={this.props.search_param}
          token={this.props.token}
          is_quote={true}
          from_msg={!!this.props.from_msg}
        />
      );
  }
}

function FlowChunk(props) {
  return (
    <TokenCtx.Consumer>
      {({ value: token }) => (
        <div className="flow-chunk">
          {!!props.title && <TitleLine text={props.title} />}
          {props.list.map((info, ind) => (
            <LazyLoad
              key={info.pid}
              offset={500}
              height="15em"
              hiddenIfInvisible={false}
            >
              <div>
                <FlowItemRow
                  info={info}
                  show_sidebar={props.show_sidebar}
                  token={token}
                  search_param={props.search_param}
                  color_picker={null}
                />
              </div>
            </LazyLoad>
          ))}
        </div>
      )}
    </TokenCtx.Consumer>
  );
}

export class Flow extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      mode: props.mode,
      search_param: props.search_text,
      loaded_pages: 0,
      chunks: {
        title: '',
        data: [],
      },
      announcement: '',
      has_update: false,
      loading_status: 'done',
      error_msg: null,
    };
    this.on_scroll_bound = this.on_scroll.bind(this);
    window.LATEST_POST_ID = parseInt(localStorage['_LATEST_POST_ID'], 10) || 0;
  }

  load_page(page) {
    const failed = (err) => {
      console.error(err);
      this.setState((prev, props) => ({
        loaded_pages: prev.loaded_pages - 1,
        loading_status: 'failed',
        error_msg: '' + err,
      }));
    };

    if (page > this.state.loaded_pages + 1) throw new Error('bad page');
    if (page === this.state.loaded_pages + 1) {
      if (this.state.mode === 'list') {
        API.get_list(page, this.props.token)
          .then((json) => {
            let announcement = this.state.announcement;
            let has_update = this.state.has_update;
            if (page === 1 && json.data.length) {
              // update latest_post_id
              let max_id = -1;
              json.data.forEach((x) => {
                if (parseInt(x.pid, 10) > max_id) max_id = parseInt(x.pid, 10);
              });
              localStorage['_LATEST_POST_ID'] = '' + max_id;
              if (json.config) {
                if (json.config.announcement) {
                  announcement = json.config.announcement;
                }
                let versions_remote = json.config.web_frontend_version
                  .substring(1)
                  .split('.');
                console.log('remote version:', versions_remote);
                if (process.env.REACT_APP_BUILD_INFO) {
                  let versions_local = process.env.REACT_APP_BUILD_INFO.substring(
                    1,
                  ).split('.');
                  if (versions_remote.length >= 3) {
                    if (
                      versions_remote[0] > versions_local[0] ||
                      (versions_remote[1] - versions_local[1] > 0 &&
                        versions_remote[0] === versions_local[0]) ||
                      (versions_remote[0] === versions_local[0] &&
                        versions_remote[1] === versions_local[1] &&
                        versions_remote[2] - versions_local[2] > 0)
                    ) {
                      has_update = true;
                      DoUpdate(
                        versions_remote[0] > versions_local[0] ||
                          versions_remote[1] > versions_local[1],
                      );
                    }
                  }
                }
              }
            }
            const finished = json.data.length === 0;
            json.data.forEach((item, ind) => {
              let comments = json.comments[item.pid];
              if (!comments) {
                comments = [];
              }
              json.data[ind].comments = comments;
              json.data[ind].comments.forEach((item) => {
                item.variant = {};
              });
            });
            this.setState((prev, props) => ({
              chunks: {
                title: 'News Feed',
                data: prev.chunks.data.concat(
                  json.data.filter(
                    (x) =>
                      prev.chunks.data.length === 0 ||
                      !prev.chunks.data
                        .slice(-100)
                        .some((p) => p.pid === x.pid),
                  ),
                ),
              },
              announcement: announcement,
              has_update: has_update,
              mode: finished ? 'list_finished' : 'list',
              loading_status: 'done',
            }));
          })
          .catch(failed);
      } else if (this.state.mode === 'search') {
        API.get_search(page, this.state.search_param, this.props.token)
          .then((json) => {
            const finished = json.data.length === 0;

            json.data.forEach((item, ind) => {
              let comments = json.comments[item.pid];
              if (!comments) {
                comments = [];
              }
              json.data[ind].comments = comments;
              json.data[ind].comments.forEach((item) => {
                item.variant = {};
              });
            });
            this.setState((prev, props) => ({
              chunks: {
                title: 'Result for "' + this.state.search_param + '"',
                data: prev.chunks.data.concat(
                  json.data.filter(
                    (x) =>
                      prev.chunks.data.length === 0 ||
                      !prev.chunks.data
                        .slice(-100)
                        .some((p) => p.pid === x.pid),
                  ),
                ),
              },
              mode: finished ? 'search_finished' : 'search',
              loading_status: 'done',
            }));
          })
          .catch(failed);
      } else if (this.state.mode === 'single') {
        const pid = parseInt(this.state.search_param.substr(1), 10);
        API.load_replies(pid, this.props.token, new ColorPicker())
          .then((json) => {
            this.setState({
              chunks: {
                title: 'PID = ' + pid,
                data: [json.post],
              },
              mode: 'single_finished',
              loading_status: 'done',
            });
          })
          .catch(failed);
      } else if (this.state.mode === 'attention') {
        let use_search = !!this.state.search_param;
        if (use_search) {
          API.get_search(page, this.state.search_param, this.props.token, true)
            .then((json) => {
              const finished = json.data.length === 0;
              this.setState((prev, props) => ({
                chunks: {
                  title:
                    'Result for "' +
                    this.state.search_param +
                    '" in Attention List',
                  data: prev.chunks.data.concat(
                    json.data.filter(
                      (x) =>
                        prev.chunks.data.length === 0 ||
                        !prev.chunks.data
                          .slice(-100)
                          .some((p) => p.pid === x.pid),
                    ),
                  ),
                },
                mode: finished ? 'attention_finished' : 'attention',
                loading_status: 'done',
              }));
            })
            .catch(failed);
        } else {
          API.get_attention(page, this.props.token)
            .then((json) => {
              const finished = json.data.length === 0;
              this.setState((prev, props) => ({
                chunks: {
                  title: 'Attention List',
                  data: prev.chunks.data.concat(
                    json.data.filter(
                      (x) =>
                        prev.chunks.data.length === 0 ||
                        !prev.chunks.data
                          .slice(-100)
                          .some((p) => p.pid === x.pid),
                    ),
                  ),
                },
                mode: finished ? 'attention_finished' : 'attention',
                loading_status: 'done',
              }));
            })
            .catch(failed);
        }
      } else {
        console.log('nothing to load');
        return;
      }

      this.setState((prev, props) => ({
        loaded_pages: prev.loaded_pages + 1,
        loading_status: 'loading',
        error_msg: null,
      }));
    }
  }

  on_scroll(event) {
    if (event.target === document) {
      const avail =
        document.body.scrollHeight - window.scrollY - window.innerHeight;
      if (avail < window.innerHeight && this.state.loading_status === 'done')
        this.load_page(this.state.loaded_pages + 1);
    }
  }

  componentDidMount() {
    this.load_page(1);
    window.addEventListener('scroll', this.on_scroll_bound);
    window.addEventListener('resize', this.on_scroll_bound);
  }
  componentWillUnmount() {
    window.removeEventListener('scroll', this.on_scroll_bound);
    window.removeEventListener('resize', this.on_scroll_bound);
  }

  render() {
    not_show_deleted = localStorage['NOT_SHOW_DELETED'] === 'on';
    let show_pid = load_single_meta(this.props.show_sidebar, this.props.token);
    return (
      <div className="flow-container">
        {this.state.announcement &&
          this.state.announcement !== localStorage['hide_announcement'] && (
            <div className="box flow-item box-announcement">
              <HighlightedMarkdown
                text={this.state.announcement}
                color_picker={this.color_picker}
                show_pid={show_pid}
              />
              <a
                onClick={() => {
                  localStorage['hide_announcement'] = this.state.announcement;
                  this.setState({ announcement: '' });
                }}
              >
                [隐藏此公告]
              </a>
            </div>
          )}

        {this.state.has_update ? (
          <div className="box flow-item box-warning">
            <p>检测到更新，正在更新树洞...</p>
            <p>
              <a onClick={DoUpdate}>[强制更新]</a>
            </p>
          </div>
        ) : (
          <FlowChunk
            title={this.state.chunks.title}
            list={this.state.chunks.data}
            mode={this.state.mode}
            search_param={this.state.search_param || null}
            show_sidebar={this.props.show_sidebar}
          />
        )}
        {this.state.loading_status === 'failed' && (
          <div className="aux-margin">
            <div className="box box-tip">
              <p>
                <a
                  onClick={() => {
                    this.load_page(this.state.loaded_pages + 1);
                  }}
                >
                  重新加载
                </a>
              </p>
              <p>{this.state.error_msg}</p>
            </div>
          </div>
        )}
        <TitleLine
          text={
            this.state.loading_status === 'loading' ? (
              <span>
                <span className="icon icon-loading" />
                &nbsp;Loading...
              </span>
            ) : (
              '© ' + process.env.REACT_APP_COPYRIGHT_STRING
            )
          }
        />
      </div>
    );
  }
}
