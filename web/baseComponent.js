// baseComponent.js
export class MXChatComponent {
    constructor() {
        this.element = null;
    }

    createElement(tagName, className = '') {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        return element;
    }

    appendTo(parent) {
        if (parent && this.element) parent.appendChild(this.element);
    }

    remove() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}