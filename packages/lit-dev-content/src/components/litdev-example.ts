/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {LitElement, html, css, property} from 'lit-element';
import {styleMap} from 'lit-html/directives/style-map';
import {nothing} from 'lit-html';
import {ifDefined} from 'lit-html/directives/if-defined.js';
import {
  getTypeScriptPreference,
  TYPESCRIPT_PREFERENCE_EVENT_NAME,
} from '../typescript-preference.js';
import 'playground-elements/playground-ide.js';
import './litdev-example-controls.js';

/**
 * Embedded playground code example in vertical layout.
 */
export class LitDevExample extends LitElement {
  static styles = css`
    :host {
      display: block;
      /* Move the border-bottom from the host to the iframe. Iframes will have a
      white background (by default), which will clip any host border slightly.
      */
      border-bottom: none !important;
    }

    #bar {
      display: flex;
      height: var(--litdev-example-bar-height);
    }

    /* With tabs */
    :host(:not([filename])) > #bar {
      border-bottom: var(--code-border);
    }

    /* Without tabs */
    :host([filename]) > #bar {
      background: var(--playground-code-background);
    }
    :host([filename]) > #bar > litdev-example-controls {
      padding-top: 6px;
    }
    :host([filename]) > playground-file-editor {
      /* Top padding is unnecessary because the same-background toolbar already
      provides a bunch of visual space at the top.*/
      padding-top: 0;
    }

    #bar,
    playground-tab-bar,
    playground-file-editor,
    playground-preview {
      border-radius: 5px;
      box-sizing: border-box;
    }

    playground-tab-bar {
      background: #fff;
      font-family: 'Open Sans', sans-serif;
      height: var(--litdev-example-tab-bar-height);
      /* Allow the tab bar to shrink below its content size so that when an
      example is very narrow the tab bar shrinks and scrolls instead of pushing
      the controls outside the parent. */
      min-width: 0;
    }

    litdev-example-controls {
      height: var(--litdev-example-controls-height);
      padding-right: 6px;
      box-sizing: border-box;
    }

    playground-file-editor {
      border: 1px solid transparent;
      height: var(--litdev-example-editor-height, 300px);
      margin-bottom: 0;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      background: var(--playground-code-background);
      /* TODO(aomarks) Should be in the playground styles */
      line-height: var(--playground-code-line-height);
      padding: var(--litdev-code-padding);
    }

    playground-preview {
      margin: 0 0.5px;
      height: var(--litdev-example-preview-height, 100px);
      border-top: var(--code-border);
      border-bottom: var(--code-border);
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }

    playground-preview::part(preview-toolbar) {
      /* TODO(aomarks) The toolbar should be a separate element altogether. Then
         we can just omit rendering it. */
      display: none;
    }
  `;

  /**
   * Path to the project dir from `samples/PATH/project.json`.
   */
  @property()
  project?: string;

  /**
   * Name of file in project to display.
   * If no file is provided, we show the tab-bar with all project files.
   */
  @property({reflect: true})
  filename?: string;

  /**
   * Base URL for script execution sandbox.
   */
  @property({attribute: 'sandbox-base-url'})
  sandboxBaseUrl?: string;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener(
      TYPESCRIPT_PREFERENCE_EVENT_NAME,
      this._onTypeScriptPreferenceChanged
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(
      TYPESCRIPT_PREFERENCE_EVENT_NAME,
      this._onTypeScriptPreferenceChanged
    );
  }

  private _onTypeScriptPreferenceChanged = () => {
    this.requestUpdate();
  };

  render() {
    if (!this.project) {
      return nothing;
    }
    const showTabBar = !this.filename;
    // Only the top element should have a border radius.
    const fileEditorOverrideStyles = {
      borderRadius: showTabBar ? 'unset' : 'inherit',
    };

    const mode = getTypeScriptPreference();
    const projectSrc =
      mode === 'ts'
        ? `/samples/${this.project}/project.json`
        : `/samples/js/${this.project}/project.json`;
    const filename =
      mode === 'ts' ? this.filename : this.filename?.replace(/.ts$/, '.js');

    return html`
      <playground-project
        sandbox-base-url=${ifDefined(this.sandboxBaseUrl)}
        id="project"
        project-src=${projectSrc}
      >
      </playground-project>

      <div id="bar">
        ${showTabBar
          ? html`<playground-tab-bar
              project="project"
              editor="project-file-editor"
            ></playground-tab-bar>`
          : nothing}

        <litdev-example-controls
          .project=${this.project}
        ></litdev-example-controls>
      </div>

      <playground-file-editor
        id="project-file-editor"
        project="project"
        filename="${ifDefined(filename)}"
        style=${styleMap(fileEditorOverrideStyles)}
      >
      </playground-file-editor>

      <playground-preview project="project"></playground-preview>
    `;
  }
}

customElements.define('litdev-example', LitDevExample);
