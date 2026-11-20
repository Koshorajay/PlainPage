import { useEffect, useRef, useState } from 'react';
import type { RuntimeConfig } from '../config';
import { getAppCheckMode, HAS_CLOUD } from '../firebase/app';
import type { DeviceModel } from '../hooks';
import { DEV_MOCK } from '../platform';
import { BookIcon, CloudIcon, DeviceIcon, DownloadIcon, LockIcon, Logo, OfflineIcon, TextIcon } from './icons';

interface Props {
  device: DeviceModel;
  online: boolean;
  config: RuntimeConfig;
  privateMode: boolean;
  onPrivateMode: (on: boolean) => void;
  onOpenDisplay: () => void;
  onOpenLibrary: () => void;
  onHome: () => void;
}

function chipLabel(device: DeviceModel): string {
  if (device.checking) return 'Checking...';
  switch (device.status) {
    case 'available':
      return 'On-device ready';
    case 'downloading':
      return device.progress !== null ? `Downloading ${Math.round(device.progress * 100)}%` : 'Downloading model';
    case 'downloadable':
      return 'Model not downloaded';
    default:
      return 'Cloud only';
  }
}

const FLAG_URL = 'chrome://flags/#prompt-api-for-gemini-nano-multimodal-input';

function isDesktopChrome(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[]; mobile?: boolean } })
    .userAgentData;
  if (data?.brands) return !data.mobile && data.brands.some((b) => b.brand === 'Google Chrome');
  return /Chrome\//.test(navigator.userAgent) && !/Mobile|Android|Edg\/|OPR\//.test(navigator.userAgent);
}

/** Step-by-step help for turning on Chrome's built-in model (useful for judges trying the hybrid path). */
function EnableOnDevice() {
  const [copied, setCopied] = useState(false);
  if (!isDesktopChrome()) {
    return (
      <p>
        This browser has no on-device model, so PlainPage uses the cloud. On-device needs Chrome on a desktop
        computer.
      </p>
    );
  }
  return (
    <>
      <p>Chrome's built-in model is not turned on in this browser, so PlainPage uses the cloud. To try on-device:</p>
      <ol className="steps">
        <li>
          Open this address in a new tab:
          <span className="steps-url">
            <code>{FLAG_URL}</code>
            <button
              className="link-btn"
              onClick={() => {
                void navigator.clipboard
                  .writeText(FLAG_URL)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </li>
        <li>
          Set it to <strong>Enabled</strong> and press <strong>Relaunch</strong>.
        </li>
        <li>
          Come back here, open this panel and press <strong>Download on-device model</strong>.
        </li>
      </ol>
      <p className="steps-note">
        Chrome needs about 22 GB of free disk space and either a GPU with more than 4 GB of memory, or 16 GB of RAM
        and 4 CPU cores.
      </p>
    </>
  );
}

export function TopBar(props: Props) {
  const { device, online, config } = props;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const ready = device.status === 'available';

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false);
        return;
      }
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const appCheck = getAppCheckMode();

  return (
    <header className="topbar">
      <button className="brand" onClick={props.onHome} aria-label="PlainPage home">
        <Logo />
        <span className="brand-name">PlainPage</span>
      </button>

      <div className="topbar-actions">
        {!online && (
          <span className="chip chip--warn" title="You are offline">
            <OfflineIcon size={15} />
            <span className="chip-text">Offline</span>
          </span>
        )}

        <div className="chip-wrap" ref={wrap}>
          <button
            className={`chip chip--button ${ready ? 'chip--device' : 'chip--cloud'}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            {ready ? <DeviceIcon size={15} /> : <CloudIcon size={15} />}
            <span className="chip-text">{chipLabel(device)}</span>
          </button>

          {open && (
            <div className="popover" role="dialog" aria-label="Where PlainPage runs">
              <h3>Where PlainPage runs</h3>
              {device.status === 'available' && (
                <p>
                  Chrome's built-in model is ready. Short pages are rewritten <strong>on this device</strong>: private,
                  free, and it works offline. Long pages and other languages use the cloud.
                </p>
              )}
              {device.status === 'downloadable' && (
                <>
                  <p>
                    This device can run the model, but it is not downloaded yet. It is a one-time download of a few
                    gigabytes. Until then the cloud does the work.
                  </p>
                  <button className="btn btn--primary btn--small" onClick={device.download}>
                    <DownloadIcon size={16} /> Download on-device model
                  </button>
                </>
              )}
              {device.status === 'downloading' && (
                <>
                  <p>The on-device model is downloading. The cloud covers for it until it is ready.</p>
                  <div className="bar" role="progressbar" aria-valuenow={Math.round((device.progress ?? 0) * 100)}>
                    <div className="bar-fill" style={{ width: `${Math.round((device.progress ?? 0) * 100)}%` }} />
                  </div>
                </>
              )}
              {device.status === 'unavailable' && <EnableOnDevice />}
              {device.error && <p className="popover-error">{device.error}</p>}

              <dl className="facts">
                <div>
                  <dt>On device</dt>
                  <dd>Gemini Nano (Chrome built-in)</dd>
                </div>
                <div>
                  <dt>Cloud</dt>
                  <dd>{config.cloudModel}</dd>
                </div>
                <div>
                  <dt>Stays local up to</dt>
                  <dd>{Math.round(config.deviceMaxChars / 1000)}k characters</dd>
                </div>
                <div>
                  <dt>App Check</dt>
                  <dd>
                    {DEV_MOCK
                      ? 'Dev mock'
                      : !HAS_CLOUD
                        ? 'Not set up'
                        : appCheck === 'recaptcha'
                          ? 'reCAPTCHA v3'
                          : appCheck === 'debug'
                            ? 'Debug token'
                            : 'Off'}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        <label
          className={`switch ${props.privateMode ? 'is-on' : ''}`}
          title="Private mode: text never leaves this device"
        >
          <input
            type="checkbox"
            role="switch"
            checked={props.privateMode}
            onChange={(e) => props.onPrivateMode(e.target.checked)}
          />
          <LockIcon size={15} />
          <span className="switch-text">Private</span>
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
        </label>

        <button className="icon-btn" onClick={props.onOpenLibrary} aria-label="Library" title="Library">
          <BookIcon />
        </button>
        <button className="icon-btn" onClick={props.onOpenDisplay} aria-label="Display settings" title="Display">
          <TextIcon />
        </button>
      </div>
    </header>
  );
}
