/* eslint-disable no-console */
import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { NonIdealState, Button, Intent, Classes } from '@blueprintjs/core';

import extractDomain from '../libs/extractDomain';
import {
  updateTargetUrl,
  updateIsFailed,
  updateIsLoading,
  updateCanGoBack,
  updateCanGoForward,
} from '../actions/nav';
import { toggleSettingDialog, getBehaviors } from '../actions/settings';
import { toggleFindInPageDialog, updateFindInPageMatches } from '../actions/findInPage';
import { screenResize } from '../actions/screen';

import WebView from './WebView';
import Settings from './Settings';
import Nav from './Nav';
import FindInPage from './FindInPage';
import showUpdateToast from '../../shared/components/showUpdateToast';

class App extends React.Component {
  constructor() {
    super();
    this.handleNewWindow = this.handleNewWindow.bind(this);
    this.handleDidFailLoad = this.handleDidFailLoad.bind(this);
    this.handleDidStopLoading = this.handleDidStopLoading.bind(this);
    this.handleDidGetRedirectRequest = this.handleDidGetRedirectRequest.bind(this);
    this.handleUpdateTargetUrl = this.handleUpdateTargetUrl.bind(this);
  }

  componentDidMount() {
    const {
      requestToggleSettingDialog,
      requestToggleFindInPageDialog,
      requestUpdateFindInPageMatches,
      requestGetBehaviors,
      onResize,
    } = this.props;
    const c = this.c;

    requestGetBehaviors();

    showUpdateToast();

    window.addEventListener('resize', onResize);

    ipcRenderer.on('toggle-dev-tools', () => {
      c.openDevTools();
    });

    ipcRenderer.on('toggle-setting-dialog', () => {
      requestToggleSettingDialog();
    });

    ipcRenderer.on('toggle-find-in-page-dialog', () => {
      if (this.props.findInPageIsOpen) {
        c.stopFindInPage('clearSelection');
        requestUpdateFindInPageMatches(0, 0);
      }
      requestToggleFindInPageDialog();
    });

    ipcRenderer.on('change-zoom', (event, message) => {
      c.setZoomFactor(message);
    });

    ipcRenderer.on('reload', () => {
      c.reload();
    });

    ipcRenderer.on('go-back', () => {
      c.goBack();
    });

    ipcRenderer.on('go-forward', () => {
      c.goForward();
    });

    ipcRenderer.on('go-home', () => {
      c.loadURL(this.props.customHome || window.shellInfo.url);
    });

    ipcRenderer.on('go-to-url', (e, url) => {
      c.loadURL(url);
    });

    ipcRenderer.on('copy-url', () => {
      const currentURL = c.getURL();
      clipboard.writeText(currentURL);
    });
  }

  componentDidUpdate() {
    const { findInPageIsOpen, findInPageText } = this.props;
    const c = this.c;

    // Restart search if text is available
    if (findInPageIsOpen && findInPageText.length > 0) {
      c.findInPage(findInPageText, { forward: true });
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.props.onResize);
  }

  handleDidGetRedirectRequest(e) {
    const c = this.c;
    const { newURL, isMainFrame } = e;
    // https://github.com/webcatalog/webcatalog/issues/42
    if (isMainFrame && extractDomain(newURL) === 'twitter.com') {
      setTimeout(() => c.loadURL(newURL), 100);
      e.preventDefault();
    }
  }

  handleNewWindow(e) {
    const nextUrl = e.url;
    const c = this.c;
    console.log(`newWindow: ${nextUrl}`);
    // open external url in browser if domain doesn't match.
    const curDomain = extractDomain(window.shellInfo.url);
    const nextDomain = extractDomain(nextUrl);

    // open new window
    if (
      nextDomain === null
      || nextDomain === 'feedly.com'
      || nextUrl.indexOf('oauth') > -1 // Works with Google & Facebook.
    ) {
      return;
    }

    // navigate
    if (nextDomain && (nextDomain === curDomain || nextDomain === 'accounts.google.com')) {
      // https://github.com/webcatalog/webcatalog/issues/35
      e.preventDefault();
      c.loadURL(nextUrl);
      return;
    }

    // open in browser
    e.preventDefault();
    ipcRenderer.send('open-in-browser', nextUrl);
  }

  handleDidFailLoad(e) {
    // errorCode -3: cancelling
    console.log('Error: ', e);
    if (e.isMainFrame && e.errorCode < 0 && e.errorCode !== -3) {
      const { requestUpdateIsFailed } = this.props;
      requestUpdateIsFailed(true);
    }
  }

  handleDidStopLoading() {
    const {
      requestUpdateIsLoading,
      requestUpdateCanGoBack,
      requestUpdateCanGoForward,
    } = this.props;
    const c = this.c;

    requestUpdateIsLoading(false);
    requestUpdateCanGoBack(c.canGoBack());
    requestUpdateCanGoForward(c.canGoForward());

    ipcRenderer.send('set-setting', `lastPages.${window.shellInfo.id}`, c.getURL());
  }

  handlePageTitleUpdated({ title }) {
    ipcRenderer.send('set-title', title);

    const itemCountRegex = /[([{](\d*?)[}\])]/;
    const match = itemCountRegex.exec(title);
    const newBadge = match ? match[1] : '';

    ipcRenderer.send('badge', newBadge);
  }

  handleUpdateTargetUrl({ url }) {
    const { requestUpdateTargetUrl } = this.props;
    requestUpdateTargetUrl(url);
  }

  render() {
    const {
      url,
      findInPageIsOpen,
      isFailed,
      isFullScreen,
      customHome,
      requestUpdateIsFailed,
      requestUpdateIsLoading,
      requestUpdateFindInPageMatches,
      targetUrl,
    } = this.props;

    const showNav = process.platform === 'darwin' && !isFullScreen;

    let usedHeight = showNav ? 32 : 0;
    if (findInPageIsOpen) usedHeight += 50;

    return (
      <div
        style={{
          height: '100vh',
        }}
      >
        {isFailed ? (
          <div
            style={{
              height: '100vh',
              width: '100vw',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <NonIdealState
              visual="error"
              className="no-connection"
              title="Internet Connection"
              description="Please check your Internet connection and try again."
              action={(
                <Button
                  iconName="repeat"
                  intent={Intent.PRIMARY}
                  className={Classes.LARGE}
                  text="Try Again"
                  onClick={() => {
                    requestUpdateIsFailed(false);
                    this.c.reload();
                  }}
                />
              )}
            />
          </div>
        ) : null}
        {showNav ? (
          <Nav
            onHomeButtonClick={() => this.c.loadURL(customHome || window.shellInfo.url)}
            onBackButtonClick={() => this.c.goBack()}
            onForwardButtonClick={() => this.c.goForward()}
            onRefreshButtonClick={() => this.c.reload()}
          />
        ) : null}
        {findInPageIsOpen ? (
          <FindInPage
            onRequestFind={(text, forward) => this.c.findInPage(text, { forward })}
            onRequestStopFind={() => {
              this.c.stopFindInPage('clearSelection');
              requestUpdateFindInPageMatches(0, 0);
            }}
          />
        ) : null}
        <div style={{ height: `calc(100vh - ${usedHeight}px)`, width: '100%' }}>
          <WebView
            ref={(c) => { this.c = c; }}
            src={url}
            style={{ height: '100%', width: '100%' }}
            className="webview"
            plugins
            allowpopups
            autoresize
            preload="../webview_preload.js"
            // enable nodeintegration in testing mode (mainly for Spectron)
            nodeintegration={window.shellInfo.isTesting}
            useragent={window.shellInfo.userAgent}
            partition={`persist:${window.shellInfo.id}`}
            onDidGetRedirectRequest={this.handleDidGetRedirectRequest}
            onDidFailLoad={this.handleDidFailLoad}
            onNewWindow={this.handleNewWindow}
            onDidStartLoading={() => requestUpdateIsLoading(true)}
            onDidStopLoading={this.handleDidStopLoading}
            onFoundInPage={({ result }) => {
              requestUpdateFindInPageMatches(result.activeMatchOrdinal, result.matches);
            }}
            onPageTitleUpdated={this.handlePageTitleUpdated}
            onUpdateTargetUrl={this.handleUpdateTargetUrl}
          />
        </div>
        <div
          style={{
            position: 'fixed',
            zIndex: 1000,
            bottom: 0,
            left: 0,
            backgroundColor: '#CED9E0',
            lineHeight: '20px',
            fontSize: 12,
            padding: '0 12px',
            borderRadius: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100vw',
          }}
        >
          {targetUrl}
        </div>
        <Settings />
      </div>
    );
  }
}

App.propTypes = {
  url: PropTypes.string.isRequired,
  findInPageIsOpen: PropTypes.bool.isRequired,
  findInPageText: PropTypes.string.isRequired,
  isFullScreen: PropTypes.bool,
  isFailed: PropTypes.bool,
  customHome: PropTypes.string,
  targetUrl: PropTypes.string,
  onResize: PropTypes.func.isRequired,
  requestUpdateTargetUrl: PropTypes.func.isRequired,
  requestUpdateIsFailed: PropTypes.func.isRequired,
  requestUpdateIsLoading: PropTypes.func.isRequired,
  requestUpdateCanGoBack: PropTypes.func.isRequired,
  requestUpdateCanGoForward: PropTypes.func.isRequired,
  requestToggleSettingDialog: PropTypes.func.isRequired,
  requestToggleFindInPageDialog: PropTypes.func.isRequired,
  requestUpdateFindInPageMatches: PropTypes.func.isRequired,
  requestGetBehaviors: PropTypes.func.isRequired,
};

const mapStateToProps = state => ({
  findInPageIsOpen: state.findInPage.get('isOpen'),
  findInPageText: state.findInPage.get('text'),
  isFullScreen: state.screen.get('isFullScreen'),
  isFailed: state.nav.get('isFailed'),
  customHome: state.settings.getIn(['behaviors', 'customHome']),
  targetUrl: state.nav.get('targetUrl'),
});

const mapDispatchToProps = dispatch => ({
  onResize: () => dispatch(screenResize(window.innerWidth)),
  requestUpdateTargetUrl: targetUrl => dispatch(updateTargetUrl(targetUrl)),
  requestUpdateIsFailed: isFailed => dispatch(updateIsFailed(isFailed)),
  requestUpdateIsLoading: isLoading => dispatch(updateIsLoading(isLoading)),
  requestUpdateCanGoBack: canGoBack => dispatch(updateCanGoBack(canGoBack)),
  requestUpdateCanGoForward: canGoForward => dispatch(updateCanGoForward(canGoForward)),
  requestToggleSettingDialog: () => dispatch(toggleSettingDialog()),
  requestToggleFindInPageDialog: () => dispatch(toggleFindInPageDialog()),
  requestUpdateFindInPageMatches: (activeMatch, matches) =>
    dispatch(updateFindInPageMatches(activeMatch, matches)),
  requestGetBehaviors: () => dispatch(getBehaviors()),
});

export default connect(
  mapStateToProps, mapDispatchToProps,
)(App);
