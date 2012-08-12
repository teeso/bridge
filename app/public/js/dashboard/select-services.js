var inventory = [ 	{name:"transportation", avail: 10, total: 100}, 
					{name:"mental", avail:20, total:100}, 
					{name:"financial", avail: 30, total: 100},
					{name:"employment", avail: 40, total: 100},
					{name:"hygiene", avail: 50, total: 100},
					{name:"health", avail: 60, total: 100},
					{name:"meals", avail: 70, total: 100},
					{name:"housing", avail: 80, total: 100}
				];
var socket = io.connect('/bridge');
// Stub out the socket handler...
socket.on('bridge-event', function(inv) {
	console.log(inv);
	// inv will be an array of eight objects mapped to the categories
});

function updateFuelBars(type) {
	_.each(inventory, function(service) {
		var $service, $progress, percent;
		$service = $('div[data-'+type+'="'+service.name+'"]');
		$progress = $service.find('.v-progress-bar');
		// our fuel gauges are 100px high so this works out well
		percent = parseInt(100 * (service.avail / service.total), 10);
		$progress.css({ 'margin-top': percent + 'px' });
	});
}

window.ServicesModel = {
	selections: [],
	currentCategory: '',
	init: function(previousSelections) {
		if (previousSelections) {
			this.selections = previousSelections;
		}
		$.pubsub('publish', 'services.update', this.selections);
	},
	update: function(collection) {
		this.selections = collection;
		$.pubsub('publish', 'services.update', this.selections);
	},
	reset: function() {
		this.selections = [];
	}
};

window.SelectServicesController = {
	init: function(el) {
		this.$el = $(el);
		this.$services = this.$el.find('.service');

		// Every method of this object will be called with the proper
		// scope now. Take THAT jQuery!
		_.bindAll(this);

		// Add application event listeners
		$.pubsub('subscribe', 'login.complete', this.onLoginComplete);
		$.pubsub('subscribe', 'logout.complete', this.onLogoutComplete);
		$.pubsub('subscribe', 'services.update', this.onServicesUpdated);
		
		// Check for user state
		if (session.client) {
			this.onLoginComplete();
		} else {
			this.onLogoutComplete();
		}
	},
	reset: function() {
		// Clean out the model
		window.ServicesModel.reset();
	},
	updateSelections: function(subCategory) {
		var currentCategory, previousSelections, filteredSelections;
		currentCategory = window.ServicesModel.currentCategory;
		previousSelections = window.ServicesModel.selections;
		// Remove any selections for the current category
		filteredSelections = _.reject(previousSelections, function(selection) {
			return selection.cat === currentCategory;
		});
		// If the subCategory is not undefined then create a new selection
		// and add it to the set
		if (subCategory) {
			filteredSelections.push({ cat: currentCategory, sub: subCategory });
		}
		// Update the model
		window.ServicesModel.update(filteredSelections);
	},
	highlightServices: function(services) {
		var self = this;
		self.$services.removeClass('is-selected');
		_.each(services, function(service) {
			self.$services.filter('div[data-category="'+service.cat+'"]')
				.addClass('is-selected');
		});
	},
	onLoginComplete: function(event, data) {
		$('.service')
			.removeClass('is-disabled')
			.addClass('is-enabled');

		$('.button-reserve').removeClass('faded');

		// Add view event listeners
		$('.service').on('click', this.onServiceClicked);
	},
	onLogoutComplete: function(event, data) {
		$('.service').removeClass('is-selected');
		$('.button-reserve').addClass('faded');

		$('.service, .button-reserve')
			.removeClass('is-enabled')
			.addClass('is-disabled');

		this.reset();

		// Remove view event listeners
		$('.service').off('click', this.onServiceClicked);
		$('#request-services').off('click', this.onRequestServicesClicked);
	},
	onServicesUpdated: function(event, data) {
		this.highlightServices(data);

		if (data && data.length) {
			$('.button-reserve')
					.removeClass('is-disabled')
					.addClass('is-enabled');
			$('#request-services').on('click', this.onRequestServicesClicked);
		} else {
			$('.button-reserve')
					.removeClass('is-enabled')
					.addClass('is-disabled');
			$('#request-services').off('click', this.onRequestServicesClicked);
		}
	},
	onServiceClicked: function(event) {
		var serviceName, service, tmpl, compiled, serviceSelectionModal;

		// Grab the appropriate service from our JSON object
		serviceName = $(event.currentTarget).data('category');
		service = _.find(services, function(service) { return service.name === serviceName; });
		
		// Make sure we found something...
		if (service) {
			window.ServicesModel.currentCategory = service.name;
			
			// Compile the Mustache template for our modal and
			// pass it the service
			$tmpl = $('#modal-service-selection').html();
			compiled = Mustache.render($tmpl, { service: service });
			$selectServicesModal = $(compiled);

			// Assign our modal to a controller
			window.SelectServicesModalController.init($selectServicesModal);

			// Bootstrap it and add it to the page
			$selectServicesModal.modal({ show : false, keyboard : true, backdrop : true });
			$selectServicesModal.modal('show');
			$selectServicesModal.on('hidden', this.onModalHidden);
		}
	},
	onModalHidden: function() {
		// Destroy the modal when it's hidden. Since we rebuild it every time
		// this is necessary to prevent them from stacking up in the DOM
		// Let's also make sure to save whatever chategory may have been selected
		var subCategory  = $selectServicesModal.find('.is-selected').data('sub');
		this.updateSelections(subCategory);

		$selectServicesModal.detach();
	},
	onRequestServicesClicked: function(event) {
		$.ajax({
			url: '/request-services',
			type: "POST",
			data: { services : window.ServicesModel.selections },
			success: function(ok) { 
				window.location.href = '/request-provider'; 
			},
			error: function(jqXHR){ 
				console.log('error', jqXHR.responseText+' :: '+jqXHR.statusText); 
			}
		});
	}
};

window.SelectServicesModalController = {
	init: function(el) {
		this.$el = $(el);
		this.$services = this.$el.find('.service');

		// Set proper function scope
		_.bindAll(this);

		// Add view listeners
		this.$el.on('shown', this.highlightPreviousSelections);
		$('body').on('mouseup', this.onMouseUp);
	},
	highlightPreviousSelections: function() {
		// If the user previously selected something in this category let's
		// indicate that
		var currentCategory, selections, prevSelection;
		currentCategory = window.ServicesModel.currentCategory;
		selections = window.ServicesModel.selections;
		prevSelection = _.find(selections, function(selection) {
			return selection.cat === currentCategory;
		});

		if (prevSelection) {
			this.$el.find('div[data-sub="'+prevSelection.sub+'"]')
				.addClass('is-selected');
		}
	},
	onMouseUp: function() {
		var isModal, isService, isBackdrop, isClose, $service;
		isModal = !!$(event.target).parents('.modal').length;
		isService = !!$(event.target).parents('.service').length;
		isClose = !!$(event.target).parents('.button-close').length;
		isBackdrop = $(event.target).hasClass('modal-backdrop');

		// If the user clicked a new service highlight it
		// If the service was already highlighted unhighlight it
		if (isService) {
			$service = $(event.target).parents('.service');
			if ($service.hasClass('is-selected')) {
				$service.removeClass('is-selected');
			} else {
				this.$services.removeClass('is-selected');
				$service.addClass('is-selected');
			}
		}

		// Treat a click in the white space of the modal as an
		// attempt to cancel the current selection
		if (isModal && !isService && !isClose) {
			this.$services.removeClass('is-selected');
		}
		
		// If the user clicked anything other than the white space in
		// the modal, close the modal.
		if (isService || isBackdrop || isClose) {
			$('body').off('mouseup', this.onMouseUp);
			this.$el.modal('hide');
		}
	}
};

$(document).ready(function() {
	window.SelectServicesController.init('#select-services');
	var previousSelections = session.services || null;
	window.ServicesModel.init(previousSelections);
	updateFuelBars('category');
	// var timeoutModal = $('.modal-timeout');
	// timeoutModal.modal({ show : false, keyboard : true, backdrop : true });
	// timeoutModal.modal('show');
});