import { $, mw } from "../../globals";
import API from "../api";
import { dateFromSubpageName } from "../util"; 
import MainWindowModel from "../Models/MainWindowModel";
import windowManager from "../windowManager";

// <nowiki>
class DiscussionViewController {
	constructor(model, widget) {
		this.model = model;

		this.statusLabel = widget.statusLabel;
		this.buttonGroup = widget.buttonGroup;
		this.closeButton = widget.closeButton;
		this.relistButton = widget.relistButton;
		this.quickCloseButtonMenu = widget.quickCloseButtonMenu;

		this.model.connect(this, {update: "updateFromModel"});

		this.closeButton.connect(this, {click: ["onButtonClick", "close"]});
		this.relistButton.connect(this, {click: ["onButtonClick", "relist"]});
		this.quickCloseButtonMenu.connect(this, {choose: "onQuickCloseChoose"});

		if ( this.model.pages.length ) {
			this.fetchInfoFromApi();
		}
	}
	fetchInfoFromApi() {
		const pagesExistencesPromise = API.get({
			action: "query",
			format: "json",
			formatversion: 2,
			titles: this.model.pagesNames,
			prop: "info",
			inprop: "talkid"
		}).then(response => response.query.pages.forEach(page => {
			const pageTitle = mw.Title.newFromText(page.title);
			const talkpageTitle = pageTitle.getTalkPage();
			mw.Title.exist.set(pageTitle.getPrefixedDb(), !page.missing);
			if ( talkpageTitle ) {
				mw.Title.exist.set(talkpageTitle.getPrefixedDb(), !!page.talkid);
			}
		}));
		const nominationDatePromise = ( this.model.venue.type !== "afd" && this.model.venue.type !== "mfd" )
			? $.Deferred().resolve( dateFromSubpageName(this.model.discussionSubpageName) )
			: API.get({
				action: "query",
				format: "json",
				formatversion: 2,
				titles: this.model.discussionPageName,
				prop: "revisions",
				rvprop: "timestamp",
				rvdir: "newer",
				rvlimit: "1"
			}).then(response => {
				const page = response.query.pages[0];
				const timestamp = page.revisions[0].timestamp;
				return new Date(timestamp);
			});
		nominationDatePromise.then(nominationDate => {
			this.model.setNominationDate(nominationDate);
		});
		$.when(pagesExistencesPromise, nominationDatePromise)
			.then(() => { this.model.setStatusReady(); })
			.catch((code, error) => { this.model.setStatusError(code, error); });
	}

	updateFromModel() {
		this.statusLabel.setLabel(this.model.status).toggle(this.model.showStatus);
		this.buttonGroup.toggle(this.model.showButtons);
		this.quickCloseButtonMenu.toggle(this.model.showQuickClose);
	}
	
	/**
	 * 
	 * @param {String} type "close" or "relist" 
	 */
	onButtonClick(type) {
		if ( windowManager.hasOpenWindow() ) {
			return false;
		}
		const windowInstance = windowManager.openWindow("main", {
			model: new MainWindowModel({
				type,
				discussion: this.model
			})
		});
		windowInstance.closed.then(winData => {
			this.model.setClosedWindowData(winData);
		});
		this.model.setWindowOpened(type);
	}

	onQuickCloseChoose(menuOption) {
		const quickCloseResult = menuOption.getData();
		if ( windowManager.hasOpenWindow() ) {
			return false;
		}
		const windowInstance = windowManager.openWindow("main", {
			model: new MainWindowModel({
				type: "close",
				quick: true,
				result: quickCloseResult,
				discussion: this.model,
			})
		});
		windowInstance.closed.then(winData => {
			this.model.setClosedWindowData(winData);
		});
		this.model.setWindowOpened("close");
	}
}

export default DiscussionViewController;