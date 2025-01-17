export class Iframe {
  private origin: string;
  private frame!: HTMLIFrameElement;

  constructor(private src: string, private id = 'aztec-sdk-iframe') {
    this.origin = new URL(src).origin;
  }

  get window() {
    return this.frame.contentWindow!;
  }

  public async init() {
    document.getElementById(this.id)?.remove();

    if (document.getElementById(this.id)) {
      throw new Error(`iframe#${this.id} already exists.`);
    }

    const frame = document.createElement('iframe');
    frame.id = this.id;
    frame.height = '0';
    frame.width = '0';
    frame.style.display = 'none';
    frame.style.border = 'none';
    frame.src = this.src;

    await this.awaitFrameReady(() => document.body.appendChild(frame));

    this.frame = frame;
  }

  private async awaitFrameReady(fn: () => void) {
    let resolveFrameCreated: () => void;
    const frameReadyPromise = Promise.race([
      new Promise<void>(resolve => (resolveFrameCreated = resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Aztec SDK load timeout: ${this.src}`)), 10000)),
    ]);

    const handleFrameReadyEvent = (e: MessageEvent) => {
      if (e.origin !== this.origin) {
        return;
      }

      window.removeEventListener('message', handleFrameReadyEvent);
      resolveFrameCreated();
    };

    window.addEventListener('message', handleFrameReadyEvent);

    fn();

    await frameReadyPromise;
  }
}

export async function createIframe(src: string) {
  const iframe = new Iframe(src);
  await iframe.init();
  return iframe;
}
