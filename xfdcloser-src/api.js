import { $, mw } from "../globals";
import config from "./config";
import { recursiveMerge } from "./util";

// <nowiki>

/**
 * Extends an mw.Api object with additional methods
 * @param {mw.Api} api API object to be extended 
 * @returns {mw.Api} extended API object 
 */
function extendMwApi(api) {
	/**
	 * @param {String|String[]} titles
	 * @param {Object|null} [getParams] additional parameters for the api query
	 * @param {Function} transform function that is passed a simplifiedPage object,
	 *  and returns edit parameters as a key-value pair object (or a promise of one)
	 * @param {Function} onEachSuccess callback for each successful deletion
	 * @param {Function} onEachFail callback for each failed deletion
	 * @returns {Promise} resolved if all edits were successful, rejected if there were failures
	 */
	api.editWithRetry = function(titles, getParams, transform, onEachSuccess, onEachFail) {
		getParams = getParams || {};
		const processPage = function(page, starttime) {
			const basetimestamp = page.revisions && page.revisions[0].timestamp;
			return $.when( transform(page) ).then(
				function(editParams) {
					const baseQuery = {
						action: "edit",
						title: page.title,
						// Protect against errors and conflicts
						assert: "user",
						basetimestamp: editParams.redirect ? null : basetimestamp, // basetimestamp of a redirect should not be used if editing the redirect's target
						starttimestamp: starttime
					};
					const query = { ...baseQuery, ...editParams };
					const doEdit = function(isRetry) {
						return api.postWithToken("csrf", query).then(
							function(data) {
								if (onEachSuccess) {
									onEachSuccess(data);
								}
								return data.edit;
							},
							function(code, error) {
								if (code === "http" && !isRetry) {
									return doEdit(true);
								} else if ( code === "editconflict" ) {
									return doGetQuery(page.title);
								}
								if (onEachFail) {
									onEachFail(code, error, page.title);
								}
								return $.Deferred().reject(code, error, page.title);
							}
						);
					};
					return doEdit();
				},
				function(code, error) {
					if (onEachFail) {
						onEachFail(code, error, page.title);
					}
					return $.Deferred().reject(code, error, page.title);			
				});
		};
		
		const doGetQuery = function(titles, isRetry) {
			const baseQuery = {
				action: "query",
				format: "json",
				formatversion: "2",
				curtimestamp: 1,
				titles: titles,
				prop: "revisions|info",
				rvprop: "content|timestamp",
				rvslots: "main"
			};
			return api.get({
				...baseQuery,
				...getParams
			}).then(function(response) {
				const starttime = response.curtimestamp;
				const normalizeds = response.query.normalized || [];
				const redirects = response.query.redirects || [];

				// Get an array of promises of edits (which may either be resolved or rejected)				
				const pages = response.query.pages.map(page => {
					const redirect = redirects.find(redirect => redirect.to === page.title) || {};
					const normalized = normalizeds.find(normalized => normalized.to === page.title || normalized.to === redirect.from ) || {};
					return processPage({
						...page,
						redirect,
						titleTransformation: {
							original: normalized.from || redirect.from || page.title,
							normalized: normalized.to,
							redirected: redirect.to,
						},
						content: page.revisions && page.revisions[0].slots.main.content 
					}, starttime);
				});
				
				// Convert the array of promises into a single promise, resolved if all were
				// resolved, or rejected with an array of errors of all that failed.
				return $.when.apply(
					null,
					// Force promises to resolve as an object with a `success` key, so that
					// $.when will wait for all of them to be resolved or rejected
					pages.map(function(page) {
						return page.then(
							() => ({success: true}),
							(code, error, title) => ({
								success: false, 
								code: code,
								error: error,
								title: title
							})
						); // end page.then
					}) // end page.map
				) // end $.when
					.then(function() {
						var args = Array.prototype.slice.call(arguments);
						var errors = args.filter(function(arg) {
							return !arg.success;
						});
						if (errors.length > 0) {
							return $.Deferred().reject("write", errors.length, errors);
						}
					});
			}, function(code, error) {
				if (!isRetry) {
					return doGetQuery(titles, true);
				}
				return $.Deferred().reject("read", code, error);
			});
		};
		return doGetQuery(titles);
	};

	/**
	 * @param {String|String[]|Number|Number[]} pages pages to be deleted, either:
	 * - page titles as strings
	 * - page ids as numbers
	 * @param {Object} options options to send with the Api request
	 *  @param {String} options.reason deletion reason for logs
	 * @param {Function} onEachSuccess callback for each successful deletion
	 * @param {Function} onEachFail callback for each failed deletion
	 */
	api.deleteWithRetry = function(pages, options, onEachSuccess, onEachFail) {
		const deletePage = (titleOrId, isRetry) => {
			const baseQuery = {action: "delete"};
			if (typeof titleOrId === "number") {
				baseQuery.pageid = titleOrId;
			} else {
				baseQuery.title = titleOrId;
			}
			return api.postWithEditToken({...baseQuery, ...options}).then(
				(response) => {
					if (onEachSuccess) {
						onEachSuccess(response);
					}
					return {success: true};
				},
				(code, error) => {
					if (!isRetry) {
						return deletePage(titleOrId, true);
					}
					if (onEachFail) {
						onEachFail(code, error, titleOrId);
					}
					return {success: false, code, error, title:titleOrId};
				}
			);
		};
		
		const deletionPromises = Array.isArray(pages)
			? pages.map(page => deletePage(page))
			: [deletePage(pages)];
		
		return $.when.apply(null, deletionPromises)
			.then(function() {
				var args = Array.prototype.slice.call(arguments);
				var errors = args.filter(function(arg) {
					return !arg.success;
				});
				if (errors.length > 0) {
					return $.Deferred().reject("delete", errors.length, errors);
				}
			});
	};

	/**
	 * @param {Object} params query parameters
	 * @param {String} [method] method for sending query, default if not specified is "get"
	 * @returns {Promise} recursively merged query responses 
	 */
	api.queryWithContinue = function(params, method) {
		const baseQuery = {
			action: "query",
			format: "json",
			formatversion: "2",
			...params
		};
		const doQuery = (query, previousResult) => api[method||"get"](query).then(response => {
			const result = previousResult
				? recursiveMerge(previousResult, response.query)
				: response.query;
			if (response.continue) {
				return doQuery({...baseQuery, ...response.continue}, result);
			}
			return result;
		});

		return doQuery(baseQuery);
	};

	return api;
}

var API = extendMwApi(
	new mw.Api( {
		ajax: {
			headers: { 
				"Api-User-Agent": "XFDcloser/" + config.script.version + 
					" ( https://en.wikipedia.org/wiki/WP:XFDC )"
			}
		}
	} )
);


export default API;
export {extendMwApi};
// </nowiki>