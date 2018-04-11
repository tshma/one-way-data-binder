/** OneWayDataBinder v1.2.0
 *	supports IE9+ (excluding MutationObserver: only IE11+); slight improvements will be possible upon upgrading to IE11+ only
 * it is designed as a function as it could be instantiated multiple times within the code either for different root-elements or even a duplicated ones with different purposes/options.
 *
 * @params: 
 * @options object might include the following attributes:
 * @options.model :Object (default: undefined). used as base that can be initialized with some of the fields or all of them.
 *					if model isn't supplied OneWayDataBinder creates an empty one. 
 * @options.selector :string (default: "body"). used as selector to limit which HTML elements are contained in the model.
 * 					as document.querySelector() is used, be sure to apply comprehensive and valid selector.
 * @options.buildEmpty :boolean (default: false). if set to true OneWayDataBinder will iterate through the relevant elements and create
 *					the model accordingly using either empty values or the default values in the markup. 
 * @options.deleteable :boolean (default: false). whether deleteFromModel() can work on the model or not.
 * @options.observeDom :boolean (default: false). if set to true OneWayDataBinder will employ MutationObserver (suppose the browser supports it)
 * 					to update model automatically when nodes are added/removed from the DOM. the buildEmpty option is used to decide if
 *					their initial values are added to the model or not. 
 *
 * @returns: 
 * :Object. with the following methods: 
 * + getData(): Object. returns a clone of the model, after filtering out any deleted array elements (the filtering is done over the original!)
 * + getDataJson(): string. returns a stingified JSON of the data, after filtering as in getData(). getData() actually uses getDataJson() in the process, and parses it.
 * + extractRawData(|path :string|): Object. returns a clone of the unfiltered model (see getData() above) if no path parameter is indicated or a part of it according to given path (e.g. "person.address")
 * + extractRawDataJson(|path :string|): Object. returns a stingified JSON of the unfiltered model if no path parameter is indicated or a part of it according to given path (e.g. "person.address")
 * + deleteFromModel(path :string): boolean. deletes data according to path. returns false either when path is incorrect or deleteable == false. otherwise returns true
 * + forceUpdateForField(elementToUpdate :string/:jQuery-object/:DOM-Node): boolean. allow to update model programmatically by element with a data-model attribute. 
 * 								returns false if elementToUpdate is invalid. otherwise returns true
 * + bindToModel(selector :string/:jQuery-object/:DOM-Node |, addCurrentValues :boolean|): void. binds new inputs to the model according to a given selector or DOM/jQuery element. 
 * 								all relevant inputs within it that contain a data-model attribute will be added. addCurrentValues defaults to buildEmpty option if not sent as a parameter
 *
 **/

var OneWayDataBinder = function(options) {
	var options = options || {};
	var data = options.model || {} ,
		selector = options.selector || "body", 
		buildEmpty = options.buildEmpty || false, 
		deleteable = options.deleteable || false, 
		observeDom = options.observeDom || false;
	var inputEvent, changeEvent;
	var rootElement = getRootElement(selector);
	var observer = null;
		
	function refreshEvents() {
		if(typeof Event === "function") {
			inputEvent = new Event('input', {bubbles: false});
			changeEvent = new Event('change', {bubbles: false});
		} else {
			inputEvent = document.createEvent("Event");
			inputEvent.initEvent("input", false, true);
			changeEvent = document.createEvent("Event");
			changeEvent.initEvent("change", false, true);
		}
	}
		
	function locateAndUpdateNode(path, value, deleteNode) {			
		if(path == null || path === "") {
			console.log("Invalid path.");
			return false;
		}
		
		var parts = path.split("."), 
			p, 
			last,
			location, 
			deleteNode = deleteNode || false;
		// locate the node in the "tree" and put the value there (or delete that node)	
		for(location = data, p = 0, last = parts.length-1; p < parts.length; p+=1) {
			var brackets = parts[p].indexOf("["), 
				isArray = (brackets !== -1), // opposite of [] indication
				index, 
				tester;
				
			if(isArray) {
				index = Number(parts[p].substring(brackets+1, parts[p].indexOf("]")));
				parts[p] = parts[p].substring(0, brackets); // remove [] notation
			}	
			
			if(p < last) {	// a location in the middle of the chain						
				if(location[parts[p]] == null) {
					if(deleteNode) {
						console.warn("Failed to locate node to delete. Invalid path.");
						return false;
					}
					location[parts[p]] = isArray ? [] : {}; 
				} 
				
				if (isArray) {							
					tester = location[parts[p]][index];
					if(tester == null) { // no object exists for index
						if(deleteNode) {
							console.warn("Failed to locate node to delete. Invalid path.");
							return false;
						}
						location[parts[p]][index] = {}; // as we're in mid-chain we know it's an object // TODO check if working for an array within array
					}
					location = location[parts[p]][index];
				} else { // not an array
					location = location[parts[p]];								
				}
			} else { // p === last, location at the relevant node
				if(isArray) {
					if(location[parts[p]] == null) {
						if(deleteNode) {
							console.warn("Failed to locate node to delete. Invalid path.");
							return false;
						}
						location[parts[p]] = [];									
					}
					if(deleteNode) {
						delete location[parts[p]][index];
					} else {
						location[parts[p]][index] = value;
					}
				} else {
					if(deleteNode) {
						delete location[parts[p]];
					} else {
						location[parts[p]] = value;
					}
				}
			}
		}
	}	
	
	function locateAndFetchNode(path) {
		if(path == null || path === "") {
			console.warn("Invalid path");
			return null;
		}
		
		var parts = path.split("."), 
			p, 
			last,
			location;
		// locate the node in the "tree" and return it (or undefined if non-existant)
		for(location = data, p = 0, last = parts.length-1; p < parts.length; p+=1) {
			var brackets = parts[p].indexOf("["), 
				isArray = (brackets !== -1), // opposite of [] indication
				index, 
				tester;
				
			if(isArray) {
				index = Number(parts[p].substring(brackets+1, parts[p].indexOf("]")));
				parts[p] = parts[p].substring(0, brackets); // remove [] notation
			}	
			
			if(p < last) {							
				if(location[parts[p]] == null) { // either null or undefined
					console.warn(path + " could not be completed, and stopped at " + path.split(".").splice(0, p).join("."));
					return location[parts[p]]; 					
				} 
				// a location in the middle of the chain
				if (isArray) {							
					tester = location[parts[p]][index];
					if(tester == null) { // object for index is either null or index undefined
						console.warn(path + " could not be completed, and stopped at " + path.split(".").splice(0, p).join("."));
						return tester; // as it might be either null or undefined
					}
					location = location[parts[p]][index];
				} else { // not an array
					location = location[parts[p]];								
				}
			} else { // p === last, location at the relevant node to return
				if(isArray) {
					if(location[parts[p]] == null) {
						console.warn(path + " leads to an index in a non-existant array.");
						return location[parts[p]];									
					}
					
					return location[parts[p]][index];
				} else {
					return location[parts[p]];
				}
			}
		}
	}
	
	var bindHandler = {
		handleEvent: function(e) {
			var path = e.target.getAttribute("data-model"),
				value = "", 
				rdObj;			
				
			if(e.target.type === "checkbox") {
				value = e.target.checked
			} else if (e.target.type === "radio") {
				// if there's a checked radio in the group (according to name attribute) set its value, otherwise value remains ""
				if((rdObj = document.querySelectorAll("[name="+e.target.name+"]:checked")).length === 1) {
					value = rdObj[0].value;
				}
			} else { // type=text, textarea, select
				value = e.target.value;
			}
			
			locateAndUpdateNode(path, value, false);
		}		
	};	
	
	function triggerEventForField(element, eventType) {
		if(eventType === "input") {
			element.dispatchEvent(inputEvent);
		} else if (eventType === "change") {
			element.dispatchEvent(changeEvent);
		} else {
			console.warn("No proper eventType was sent to triggerEventForField");
		}		
	}
	
	function forceUpdateForField(element) {
		var elem, elementType; 
		if(typeof element === "string") {
			elem = document.getElementById(element);
		} else if(typeof element === "object") {
			if(element.length) {
				elem = element[0]; // jQuery element
			} else {
				elem = element; // DOM element
			}
		}
		
		if(elem == null) {
			console.error("triggerEventForField() selector argument is invalid");
			return false;
		}
		
		refreshEvents(); // we renew the events as in rare cases forceUpdateForField could be run within another (or when bindind initially)	
						//  and then if we would have used the same event, it's already dispatched for another target and exception is thrown
		
		if(elem.nodeName === "TEXTAREA" || (elem.type === "text" || elem.type === "number")) { // if no type attribute it's undefined
			triggerEventForField(elem, "input");
		} else {
			triggerEventForField(elem, "change");
		}		
		
		return true;
	}
	
	function getRootElement(selector) {
		var _rootElement = null;
		if(typeof selector === "string") {
			_rootElement = document.querySelector(selector);
		} else if(typeof selector === "object") { 
			if(selector.length) { // jQuery object
				_rootElement = selector[0];
			} else if (selector.nodeType === 1) { // DOM element
				_rootElement = selector;
			} else {
				console.warn("getRootElement was given an invalid selector and defaults to <body>");
				_rootElement = document.body;
			}			
		} else {
			console.warn("getRootElement was given an invalid selector and defaults to <body>");
			_rootElement = document.body;
		}
		
		return _rootElement || document.body;
	}
	
	function bindModel(selector, addCurrentValues) {
		var _rootElement = getRootElement(selector), 
			_buildEmpty = addCurrentValues || buildEmpty; // allows to locally override buildEmpty		
		
		var	textFields = _rootElement.querySelectorAll("input[type=text][data-model], input[type=number][data-model], textarea[data-model]"),
			checkboxes = _rootElement.querySelectorAll("input[type=checkbox][data-model]"),
			selectionLists = _rootElement.querySelectorAll("select[data-model]"),
			radioButtons = _rootElement.querySelectorAll("input[type=radio][data-model]");
		
		// if _buildEmpty === true dispatch the events locally on each and every field to create it and (if exists) enter default value
		for(i = 0; i < textFields.length; i+=1) {
			textFields[i].addEventListener("input", bindHandler, false);
			if(_buildEmpty) {
				triggerEventForField(textFields[i], "input");
			}
		}
		
		for(i = 0; i < checkboxes.length; i+=1) {
			checkboxes[i].addEventListener("change", bindHandler, false);
			if(_buildEmpty) {
				triggerEventForField(checkboxes[i], "change");
			}
		}
		
		for(i = 0; i < selectionLists.length; i+=1) {
			selectionLists[i].addEventListener("change", bindHandler, false);
			if(_buildEmpty) {
				triggerEventForField(selectionLists[i], "change");
			}
		}
		
		for(i = 0; i < radioButtons.length; i+=1) {
			radioButtons[i].addEventListener("change", bindHandler, false);
			if(_buildEmpty) {
				triggerEventForField(radioButtons[i], "change");
			}
		}
	}
	
	// remove deleted (undefined) array elements to construct a valid JSON
	function removeDeleted(object) {
		if(typeof object !== "object") {
			return;
		} 
		
		if(Array.isArray(object)) {
			for(var i = 0; i < object.length; i+=1) {
				// remove undefined elements (deleted); otherwise recourse inside
				if(object[i] === void 0) {
					object.splice(i, 1);
				} else {
					removeDeleted(object[i]);
				}
			}
		} else { // non-array object
			for(var property in object) {
				removeDeleted(object[property]);
			}
		}
		
		return object;
	}
	
	function cloneData() {
		return JSON.parse(getDataJson());			
	}
	
	function getDataJson() {
		return JSON.stringify(removeDeleted(data));
	}
	
	function extractRawDataJson (path) {
		if(path == null) {
			return JSON.stringify(data);
		}
		
		return JSON.stringify(locateAndFetchNode(path)); 
	}
	
	function extractRawData (path) {
		return JSON.parse(extractRawDataJson(path) || null); // null replaces undefined (which throws an exception for JSON.parse)
	}
			
	refreshEvents(); // create initial events
	bindModel(selector);
	// if observeDom is true we monitor the rootElement for addition of new elements and add them to the model if applicable (i.e data-model exists)
	if(observeDom) {
		if(window.MutationObserver) {
			var targetNode = rootElement; // defaults to document.body
			var options = {childList:true, subtree:true};
			var callback = function(mutationsList) {
				mutationsList.forEach(function(mutation) {
					// TODO deal with a case where the added node HAS a data-model attribute
					var added = mutation.addedNodes;
					var removed = mutation.removedNodes;
					var i; 
					for(i = 0; i < added.length; i+=1) {
						refreshEvents();
						bindModel(added[i], buildEmpty);
					}
					
					for(i = 0; i < removed.length; i+=1) {
						var modelNodes = removed[i].querySelectorAll('[data-model]');
						modelNodes.forEach(function(node) {
							locateAndUpdateNode(node.attributes["data-model"].value, null, true);
						});
					}
				});
			}; 
			
			observer = new MutationObserver(callback);
			observer.observe(targetNode, options);
		} else {
			console.warn("Your browser does not support MutationObserver and thus observeDom will not work");
		}
	}
	
	return {
		getData: cloneData, 
		
		getDataJson: getDataJson, 
		
		bindToModel: bindModel, 
		
		deleteFromModel: function(path) {
			// as delete returns true even if the property does not exist, a true is not an indication for its existence
			// yet, we return false if the path is incorrect (unwinded before reaching the last node)
			if(!deleteable) {
				console.warn("This model does not allow deletion of nodes. To allow it configure it on initialization with {deleteable:true}");
				return false; // another indication of false, besides an unwinding path to node
			}
			
			return locateAndUpdateNode(path, null, true);
		}, 
		
		forceUpdateForField: forceUpdateForField, 
				
		extractRawData: extractRawData,
		
		extractRawDataJson: extractRawDataJson
	};	
}