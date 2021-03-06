var rest = require('restler');
var Pager = require('./lib/pager');
var BASE_URL, USER, PASSWORD;
var HEADERS = null,
	COOKIE_FILE = null,
	USER_ID = null,
	attemptCount = 0,
	hold = false;

var requestRaw = function(url, method, data, callback) {
	var args = [];
	for(var i = 0; i < arguments.length; i++) {
		args.push(arguments[i]);
	}

	url = BASE_URL + args.shift();
	method = args.shift();
	callback = args.pop();

	if(args.length > 0) data = args.shift(); else data = {};

	var handleResponse = function(data, response) {
		if(response.statusCode >= 400) {
			if(typeof callback == 'function') {
				callback(errorForStatus(response.statusCode), data);
			} else {
				callback.processPage(errorForStatus(response.statusCode),data);
			}
			return;
		}

		if(data.length == 0) {
			data = {};
			data.path = response.headers.location;
			if (typeof data.path !== 'undefined') data.objectId = data.path.match(/[^\/]+$/)[0];

		}
		if(typeof callback == 'function') {
			callback(null, data, response);
		} else {
			callback.processPage(null, data, response);
		}

	}

	if(method === 'get') {
		rest.get(url, {query: data, headers: HEADERS}).on('complete', handleResponse);
	} else if(method === 'post'){
		rest.post(url, {data: data, headers: HEADERS}).on('complete', handleResponse);
	} else if(method === 'postJson') { 
		rest.postJson(url, data, {headers: HEADERS}).on('complete', handleResponse);
  }	else if(method === 'putJson') {
		rest.putJson(url, data, {headers: HEADERS}).on('complete', handleResponse);
	} else if(method === 'del') {
		rest.del(url, {headers: HEADERS}).on('complete', handleResponse);
	}
}

var request = function(url, method, data, callback, forceRequest) {
	if(COOKIE_FILE || forceRequest) {
		attemptCount = 0;
		requestRaw(url, method, data, callback);
	} else {
		// Set the function to get called later if the extension is holding for auth reasons
		if(hold) setTimeout(function() {request(url, method, data, callback)}, 2000);
	}
}

var getCookieFile = function() {
	// Retrieve auth cookie
	hold = true;
	request('auth/identity/callback', 'post', {'auth_key': USER, 'password': PASSWORD}, function(err, data, response) {
		if(err) {
			console.log('Please double check your Springboard credentials and try again');
			throw err;
			hold = false;
		} else {
      console.log('Log headers: ', response.headers);
			COOKIE_FILE = response.headers['set-cookie'] && response.headers['set-cookie'][0];
			HEADERS = {'Accept': '*/*', 'User-Agent': 'Restler for node.js', 'Cookie' : COOKIE_FILE};
			USER_ID = data;
			hold = false;
		}
	}, true);
}


var errorForStatus = function(status) {
	switch(status) {
		case 400: 
			return new Error('Error 400: Bad Request');
		case 401:
			return new Error('Error 401: Unauthorized');
		case 403: 
			return new Error('Error 403: Forbidden');
		case 404:
			return new Error('Error 404: Not Found');
		case 405:
			return new Error('Error 405: Method Not Allowed');
		case 500:
			return new Error('Error 500: Internal Server Error');
		case 503:
			return new Error('Error 503: Service Unavailable');
		default:
			return new Error('Unexpected error returned from Springboard service');
	}
}

module.exports = function(domain, user, password) {
	// BASE URL for all API calls
	BASE_URL = 'https://' + domain + '.myspringboard.us/api/';
	USER = user;
	PASSWORD = password;
	
	getCookieFile();
	
	var convertArgsToArray = function(toConvert) {
		arr = [];
		for (i = 0; i < toConvert.length; i++) {
			arr.push(toConvert[i]);
		}

		return arr.sort();
	}
	
	this.createInventoryAdjustment = function(locationId, itemId, adjustmentReasonId, qtyAdjust, cost, data, callback) {
		data = data || {};
		data['location_id'] = locationId;
		data['item_id'] = itemId;
		data['adjustment_reason_id'] = adjustmentReasonId;
		data['qty'] = qtyAdjust;
		data['unit_cost'] = cost;
		request('inventory/adjustments', 'postJson', data, callback);
	}
	
	this.createItem = function(cost, data, callback) {
		data = data || {};
		data['cost'] = cost;
		request('items', 'postJson', data, callback);
	};
	
	this.createItemVendor = function(itemId, vendorId, data, callback) {
		data = data || {};
		data['item_id'] = itemId;
		data['vendor_id'] = vendorId;
		request('items/' + itemId + '/vendors', 'postJson', data, callback);
	};
	
	this.createTicket = function(data, callback) {
		data = data || {};
		request('sales/tickets', 'postJson', data, callback);
	};

	this.createTicketLine = function(ticketId, data, callback) {
		data = data || {};
		request('sales/tickets/' + ticketId + '/lines', 'postJson', data, callback);
	};

	this.createVendor = function(name, data, callback) {
		data = data || {};
		data['name'] = name;
		request('purchasing/vendors', 'postJson', data, callback);
	}

	this.createVendorAddress = function(vendorId, city, state, country, postalCode, data, callback) {
		data = data || {};
		data['type'] = 'location'; // Vendor addresses are all of type location
		data['city'] = city;
		data['state'] = state;
		data['country'] = country;
		data['postal_code'] = postalCode;
		request('purchasing/vendors/' + vendorId + '/address', 'postJson', data, callback);
	}

	this.createVendorContact = function(vendorId, data, callback) {
		request('purchasing/vendors/' + vendorId + '/contact', 'postJson', data, callback);
	}

	this.getCustomField = function(id, callback) {
		request('custom_fields/' + id, 'get', {}, callback);
	}
	
	this.getGiftCard = function(giftCardNumber, callback) {
		request('gift_cards/' + giftCardNumber, 'get', {}, callback);
	}
	
	this.getInventoryAdjustmentsByFilter = function(jsonFilter, callback) {
		filterPager = new Pager(getInventoryAdjustmentsByFilterRaw, convertArgsToArray(arguments));
	}
	
	this.getInventoryAdjustmentsByFilterRaw = function(pageNumber, perPage, jsonFilter, pager) {
		request('inventory/adjustments?_filter=' + encodeURIComponent(JSON.stringify(jsonFilter)) + "&per_page=" + perPage + "&page=" + pageNumber, 'get', {}, pager);
	}

	this.getInventoryValues = function(data, callback) {
		data = data || {};
		request('inventory/values', 'get', data, callback);
	}

	this.getInventoryValuesByLocation = function(itemId, data, callback) {
		data = data || {};
		data['item_id'] = itemId;
		data['group[]'] = 'location_id';
		data['_include[]'] = 'location';
		request('inventory/values', 'get', data, callback)
	}

	this.getItem = function(id, callback) {
		request('items/' + id + '?_include[]=primary_vendor&_include[]=vendor_details', 'get', {}, callback);
	}
	
	this.getItemByLookup = function(lookup, callback) {
		request('items/lookup_code=' + lookup, 'get', {}, callback);
	}
	
	this.getItemsByFilter = function(jsonFilter, callback) {
		filterPager = new Pager(getItemsByFilterRaw, convertArgsToArray(arguments));
	}
	
	this.getItemsByFilterRaw = function(pageNumber, perPage, jsonFilter, pager) {
		request('items?_filter=' + encodeURIComponent(JSON.stringify(jsonFilter)) + "&per_page=" + perPage + "&page=" + pageNumber + '&_include[]=primary_vendor&_include[]=vendor_details', 'get', {}, pager);
	}
	
	this.getItemVendors = function(id, callback) {
		request('items/' + id + '/vendors', 'get', {}, callback);
	}
	
	this.getTemplate = function(id, callback) {
		request('templates/' + id + '.html.liquid', 'get', {}, callback);
	}

	this.getTicket = function(id, callback) {
		request('sales/tickets/' + id + '?_include[]=customer', 'get', {}, callback);
	}

	this.getTicketLines = function(id, callback) {
		request('sales/tickets/' + id + '/lines?_include[]=item&per_page=1000', 'get', {}, callback);
	}
	
	this.getTicketsByFilter = function(jsonFilter, callback) {
		filterPager = new Pager(getTicketsByFilterRaw, convertArgsToArray(arguments));
	}
	
	this.getTicketsByFilterRaw = function(pageNumber, perPage, jsonFilter, pager) {
		request('sales/tickets?_filter=' + encodeURIComponent(JSON.stringify(jsonFilter)) + "&per_page=" + perPage + "&page=" + pageNumber + "&_include[]=customer", 'get', {}, pager);
	}

	this.getVendor = function(id, callback) {
		request('purchasing/vendors/' + id, 'get', {}, callback);
	}
	
	this.getVendorsByFilter = function(jsonFilter, callback) {
		filterPager = new Pager(getVendorsByFilterRaw, convertArgsToArray(arguments));
	}
	
	this.getVendorsByFilterRaw = function(pageNumber, perPage, jsonFilter, pager) {
		request('purchasing/vendors?_filter=' + encodeURIComponent(JSON.stringify(jsonFilter)) + "&per_page=" + perPage + "&page=" + pageNumber, 'get', {}, pager);
	}

	// Searches items based on a search term
	this.searchItems = function(searchTerm, page, perPage, callback) {
		data = {'query': searchTerm.replace(' ', '+'), 'page': page, 'per_page': perPage};
	
		request('items', 'get', data, callback);
	}

	// Searches vendors based on a search term
	this.searchVendors = function(searchTerm, page, perPage, callback) {
		data = {'query': searchTerm.replace(' ', '+'), 'page': page, 'per_page': perPage};
	
		request('vendors', 'get', data, callback);
	}

	this.updateItem = function(id, data, callback) {
		request('items/' + id, 'putJson', data, callback);
	}
	
	this.updateTicket = function(id, data, callback) {
		request('sales/tickets/' + id, 'putJson', data, callback);
	}

	this.updateVendor = function(id, data, callback) {
		request('purchasing/vendors/' + id, 'putJson', data, callback);
	}

	this.updateVendorAddress = function(vendorId, data, callback) {
		request('purchasing/vendors/' + vendorId + '/address', 'putJson', data, callback);
	}
	return this;
}