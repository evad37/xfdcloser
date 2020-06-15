import { $, mw, OO } from "../globals";
import NoteWidget from "../Components/NoteWidget";
import ResultWidget from "../Components/ResultWidget";
import RationaleWidget from "../Components/RationaleWidget";
import OptionsGroupWidget from "../Components/OptionsGroupWidget";
import MultiResultGroupWidget from "../Components/MultiResultGroupWidget";
import PreviewWidget from "../Components/PreviewWidget";
import ResizingWidget from "../Mixins/ResizingMixin";
// <nowiki>

/**
 * @class ResultFormWidget
 * @description Base class for result form, with common elements for the more specifc result form classes.
 * @param {Object} config
 * @param {String} config.sectionHeader Discussion section header
 * @param {Boolean} config.isBasicMode
 * @param {mw.Title[]} config.pages mw.Title objects for each nominated page
 * @param {String} config.type "close" or "relist" 
 * @param {Object} config.user Object with {String}sig, {string}name, {boolean}isSysop
 * @param {String} config.venue code for venue, e.g. "afd"
 * @param {String} config.nomPageLink Nomination page link target, with #section anchor if appropriate
 * @param {jQuery} $overlay element for overlays
 */
function ResultFormWidget( config ) {
	// Configuration initialization
	config = config || {};
	// Call parent constructor
	ResultFormWidget.super.call( this, config );
	ResizingWidget.call( this, config );

	this.isMultimode = false;
	this.isRelisting = config.type === "relist";
	this.pages = config.pages;
	this.nomPageLink = config.nomPageLink;

	// Top stuff
	this.notesFieldset = new OO.ui.FieldsetLayout(/* no label */);
	this.$element.append( this.notesFieldset.$element );
	this.topNotes = [
		config.isBasicMode
			? new NoteWidget({
				title: `Discussion: ${config.sectionHeader} (basic mode only)`,
				noteContent: "Nominated pages were not detected."
			})
			: new NoteWidget({
				title: `Discussion: ${config.sectionHeader} (${config.pages.length} ${config.pages.length === 1 ? "page" : "pages"})`,
				noteContent: $("<ul>").append(
					config.pages.map( page => $("<li>").append(
						extraJs.makeLink(page.getPrefixedText())
					) )
				)
			})
	];
	if (!config.user.isSysop && config.type==="close") {
		this.topNotes.push( new NoteWidget({
			title: "Take care to avoid innapropriate non-administrator closes",
			noteContent: $("<span>").append(
				"See the ",
				extraJs.makeLink("WP:NACD"),
				" guideline for advice on appropriate and inappropriate closures."
			)
		}) );
	}
	this.notesFieldset.addItems(
		this.topNotes.map(
			noteWidget => new OO.ui.FieldLayout( noteWidget, {
				/* no label, */
				align:"top",
				$element: $("<div>").css("margin-top", "5px")
			} )
		)
	);

	// Result
	if (config.type === "close") {
		this.resultFieldset = new OO.ui.FieldsetLayout({label: "Result"});
		this.$element.append(this.resultFieldset.$element);
		this.resultWidget = new ResultWidget({
			pages: config.pages,
			venue: config.venue,
			isSysop: config.user.isSysop
		});
		this.resultWidget.connect(this, {
			"resultSelect": "onResultSelect",
			"change": "updatePreviewAndValidate"
		});
		this.resultWidgetField = new OO.ui.FieldLayout( this.resultWidget, {
			/* no label, */
			align:"top"
		} );
		this.resultFieldset.addItems( this.resultWidgetField );

		// Multiple results
		if (config.pages && config.pages.length > 1) {
			this.multiResultWidget = new MultiResultGroupWidget({
				pages: config.pages,
				venue: config.venue,
				isSysop: config.user.isSysop,
				$overlay: config.$overlay
			});
			this.multiResultWidget.connect(this, {
				"resultSelect": "onResultSelect",
				"resize": "emitResize",
				"change": "updatePreviewAndValidate"
			});
			this.multiResultWidgetField = new OO.ui.FieldLayout( this.multiResultWidget, {
				/* no label, */
				align:"top"
			} );
			this.multiResultWidgetField.toggle(false);
			this.resultFieldset.addItems(this.multiResultWidgetField, 1);
		}
	}	

	// Rationale
	this.rationaleFieldset = new OO.ui.FieldsetLayout({label: config.type === "relist" ? "Relist comment" : "Rationale"});
	this.$element.append(this.rationaleFieldset.$element);
	this.rationale = new RationaleWidget({
		relisting: config.type === "relist"
	});
	this.rationale.connect(this, {
		"copyResultsClick": "onCopyResultsClick",
		"change": "updatePreviewAndValidate"
	});
	this.rationaleFieldset.addItems(
		new OO.ui.FieldLayout( this.rationale, {
			align:"top"
		} )
	);

	// Preview
	this.previewFieldset = new OO.ui.FieldsetLayout({label: "Preview"});
	this.$element.append(this.previewFieldset.$element);
	this.preview = new PreviewWidget();
	this.preview.connect(this, {"resize": "emitResize"});
	this.previewFieldset.addItems(
		new OO.ui.FieldLayout( this.preview, {
			align: "top"
		})
	);

	if (config.type === "close") {
		// Options
		this.optionsFieldset = new OO.ui.FieldsetLayout(/* no label */);
		this.$element.append(this.optionsFieldset.$element);
		this.options = new OptionsGroupWidget({
			venue: config.venue,
			isSysop: config.user.isSysop,
			$overlay: config.$overlay
		});
		this.options.connect(this, {"resize": "emitResize"});
		this.optionsFieldset.addItems(
			new OO.ui.FieldLayout( this.options, {
				align:"top"
			} )
		);
	}	
}
OO.inheritClass( ResultFormWidget, OO.ui.Widget );
OO.mixinClass( ResultFormWidget, ResizingWidget );

ResultFormWidget.prototype.clearAll = () => console.log("ResultFormWidget", "clearAll"); //TODO: Replace stub with working function
ResultFormWidget.prototype.setPreferences = () => console.log("ResultFormWidget", "setPreferences"); //TODO: Replace stub with working function
ResultFormWidget.prototype.setPages = () => console.log("ResultFormWidget", "setPages"); //TODO: Replace stub with working function
ResultFormWidget.prototype.setType = () => console.log("ResultFormWidget", "setType"); //TODO: Replace stub with working function

ResultFormWidget.prototype.onCopyResultsClick = function() {
	if (!this.isMultimode) {
		return;
	}
	const results = this.multiResultWidget.getResultsByPage()
		.map(result => {
			const data = result.data;
			if (!data) {
				return  `*''' ''' ${result.page}\n`;
			}
			const resultText = data.result === "custom"
				? (data.customResult || " ")
				: extraJs.toSentenceCase(data.result);
			const suffix = data.requireTarget ? ` to [[${result.data.target}]]`	: "";
			const pageNamespaceId = result.page.getNamespaceId();
			const pageLink = (pageNamespaceId === 6 /* File: */ || pageNamespaceId === 14 /* Category: */ )
				? `[[:${result.page}]]`
				: `[[${result.page}]]`;
			return `*'''${resultText}''' ${pageLink}${suffix}\n`;
		}).join("");
	this.rationale.prependRationale(results);
};

ResultFormWidget.prototype.onResultSelect = function(resultData) {
	this.emit("showOptions", resultData, this.isMultimode);
};

/**
 * @param {Boolean} show `true` to show multimode, `false` for single-mode
 */
ResultFormWidget.prototype.toggleMultimode = function(show) {
	this.isMultimode = !!show;
	this.multiResultWidgetField.toggle(!!show);
	this.resultWidgetField.toggle(!show);
	this.rationale.setMultimode(!!show);
	if (show) {
		// Trigger options update by calling multiResultWidget's onResultChange
		this.multiResultWidget.onResultChange();
	} else {
		// Trigger options update by calling this widget's onResultSelect with currently selected result's data
		this.onResultSelect(this.resultWidget.getSelectedResultData() || []);
	}
	this.updatePreviewAndValidate();
};

ResultFormWidget.prototype.updatePreviewAndValidate = function() {
	this.getValidity().then(
		() => this.emit("validated", true),
		() => this.emit("validated", false)
	);
	if (this.isRelisting) {
		this.preview.setWikitext(`{{Relist|1=${this.rationale.getValue("escaped")}}}`);
		return;
	}
	const resultText = this.isMultimode ? this.multiResultWidget.getResultText() : this.resultWidget.getResultText();
	if (resultText === "soft delete" && this.pages.length) {
		this.rationale.setSoftDelete(
			this.pages[0].getPrefixedText(),
			this.nomPageLink,
			this.pages.length > 1
		);
	}
	const resultWikitext = resultText ? `'''${resultText}'''` : "";
	const target = !this.isMultimode && this.resultWidget.getTargetWikitext();
	const targetWikitext =  target ? ` to  ${target}` : "";
	const rationaleWikitext = this.rationale.getValue("punctuated") || ".";
	
	this.preview.setWikitext(
		`The result of the discussion was ${resultWikitext}${targetWikitext}${rationaleWikitext}`
	);
};

ResultFormWidget.prototype.getResultFormData = function() {
	if (this.isRelisting) {
		return {
			relistComment: this.rationale.getValue("escaped")
		};
	}
	const resultWikitext = this.isMultimode
		? this.multiResultWidget.getResultText()
		: this.resultWidget.getResultText();
	const rationaleWikitext = this.relisting
		? this.rationale.getValue()
		: this.rationale.getValue("punctuated") || ".";
	const target = !this.relisting && !this.isMultimode && this.resultWidget.getTargetWikitext({raw: true});
	const targetTitle = target && mw.Title.newFromText(target);
	const targetWikiext = target && this.resultWidget.getTargetWikitext();
	const resultOptions = !this.isMultimode && this.resultWidget.getResultOptions();
	const pageResults = this.isMultimode
		? this.multiResultWidget.getResultsByPage()
		: Array.isArray(this.pages) && this.pages.map(page => ({
			page: page,
			resultType: this.resultWidget.getSelectedResultData().result,
			data: { target } // This is duplication, but matches the form used by multiResultWidget.getResultsByPage()
		}));

	return {
		resultWikitext, // {String}
		rationaleWikitext, // {String}
		targetTitle, // [{mw.Title}]
		targetWikiext, // [{String}]
		resultOptions, // [{Object<String:boolean>}] Object with keys as option names, values as booleans (true for checked, false for unchecked)
		pageResults, // {Object[]|false} Array of {mw.Title}page, {String}resultType, [{Object}data] pairs/triplets.
	};
};

/**
 * @returns {Promise} A promise that resolves if valid, rejects if not.
 */
ResultFormWidget.prototype.getValidity = function() {
	if (this.isRelisting) {
		return $.Deferred().resolve();
	} else if (this.isMultimode) {
		return this.multiResultWidget.getValidity();
	} else {
		return this.resultWidget.getValidity();
	}
};

export default ResultFormWidget;
// </nowiki>