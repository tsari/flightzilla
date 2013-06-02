/*global jQuery, BASE_URL, d3 */
(function($) {
    window.graph = {

        /* member variables */
        xScale: null,
        yScale: null,
        centered: null,
        g: null,
        svg: null,
        width:  1280,
        height:  640,
        xAxis:  'revenue',
        yAxis:  'complexity',
        radius:  'dependency',
        color:  'risk',
        bDependencies: false,
        bounds:  {},
        aColors:  [
            '#bbb',
            '#2ca02c',
            '#98df8a',
            '#bd9e39',
            '#ff7f0e',
            '#d62728'
        ],
        filter: {
            'summary': 'eq',
            'assignee': 'eq',
            'revenue': 'min',
            'complexity': 'max',
            'dependency': 'max',
            'risk': 'max',
            'status': 'eq'
        },
        highlight: null,

        /**
         * Draw a scatter plot
         * @param data
         */
        drawScatterPlot: function(data) {
            var t = this;

            data = data || window.graphData;
            data = t.filterData(data);

            $('#project-canvas').empty();

            t.svg = d3.select("#project-canvas").append("svg").attr("width", t.width).attr("height", t.height);
            t.g = t.svg.append('g')
                .classed('chart', true)
                .attr('transform', 'translate(80, -60)');

            // Labels
            t.g.append('text').attr({'id': 'xLabel', 'x': parseInt(t.width / 2), 'y': (t.height + 30), 'text-anchor': 'middle'}).text(t.xAxis);
            t.g.append('text').attr('transform', 'translate(-60, 330)rotate(-90)').attr({'id': 'yLabel', 'text-anchor': 'middle'}).text(t.yAxis);


            // Axes
            t.xScale = d3.scale.pow()
                .exponent(4 * parseFloat(t.bounds[t.xAxis].avg / t.bounds[t.xAxis].max))
                .domain([t.bounds[t.xAxis].min, t.bounds[t.xAxis].max])
                .range([20, (t.width - 100)])
                .clamp(true);

            t.yScale = d3.scale.linear()
                .domain([t.bounds[t.yAxis].min, t.bounds[t.yAxis].max])
                .range([(t.height - 40), 100])
                .clamp(true);

            // Some value-shorthands
            var xArray = t.bounds[t.xAxis].unique,
                xMed = t.bounds[t.xAxis].avg,
                xMax = t.xScale.domain()[1],
                yMed = t.bounds[t.yAxis].avg,
                yMax = t.yScale.domain()[1];

            // draw the line
            var line = d3.svg.line()
                .x(function(d) {
                    return t.xScale(d);
                })
                .y(function(d) {
                    return t.yScale(1.25 + (yMax * (d / xMax)));
                })
                .interpolate('basis');

            t.g.append("path")
                .style('opacity', 0)
                .data([xArray])
                .attr("d", line)
                .style("fill", "none")
                .style("stroke", "red")
                .style('stroke-width', 2)
                .transition()
                .duration(1500)
                .style('opacity', 1);

            // boxes
            t.g.append("svg:line")
                .attr("class", "medianLine hMedianLine")
                .attr("x1",0)
                .attr("y1",0)
                .attr("x2", t.width)
                .attr("y2",0)
                .attr("transform", "translate(0," + (t.yScale(yMed)) + ")");

            t.g.append("svg:line")
                .attr("class", "medianLine vMedianLine")
                .attr("x1",0)
                .attr("y1",0)
                .attr("x2",0)
                .attr("y2",t.height)
                .attr("transform", "translate(" + (t.xScale(xMed)) + ",0)");

            // Render axes
            t.g.append("g")
                .attr("class", "x label")
                .attr('transform', 'translate(0, 630)')
                .attr('id', 'xAxis')
                .call(t.xAxisRender);

            t.g.append("g")
                .attr("class", "y label")
                .attr('id', 'yAxis')
                .attr('transform', 'translate(-10, 0)')
                .call(t.yAxisRender);

            // Data
            var borderColor = d3.scale.category20c();
            t.g.selectAll('circle')
                .data(_.toArray(data))
                .enter()
                .append('circle')
                .attr('cx', function(d) {
                    return t.xScale(t.getValue(d, t.xAxis));
                })
                .attr('cy', function(d) {
                    return t.yScale(t.getValue(d, t.yAxis));
                })
                .attr('r', t.getRadius)
                .attr('fill', function(d, i) {
                    return t.aColors[d[t.color]];
                })
                .attr('stroke', function(d) {
                    return borderColor(d.id);
                })
                .attr('stroke-width', 2)
                .style('cursor', 'pointer')
                .sort(t.order)
                .on('mouseover', function(d) {
                    var el = d3.select(this),
                        ra = el.attr('r');

                    el.transition().duration(100).attr('ra', ra).attr("r", parseInt(ra) + 5);
                    if (t.highlight) {
                        t.highlight.transition().duration(100).attr("r", t.highlight.attr('ra'));
                    }

                    t.highlight = el;

                    var $d = $('<dl/>', {
                        class: 'dl-horizontal'
                    });
                    $.each(d, function(key, value) {
                        if (key !== 'summary') {
                            $d.append('<dt>' + key + '</dt><dd>' + ((value) ? value : '&nbsp;') + '</dd>');
                        }
                    });

                    $('#graph-info').empty()
                        .append('<h5><a href="' + BUGZILLA + '/show_bug.cgi?id=' + d.id + '" target="_blank">' + d.summary + '</a></h5>')
                        .append($d)
                        .show();
                })
                .call(
                    d3.behavior.zoom()
                        .x(t.xScale)
                        .y(t.yScale)
                        .scaleExtent([1, 13])
                        .on('zoom', t.zoom)
                );
        },

        /**
         * Update the plot, when a selection is changed
         */
        updateScatterPlot: function() {
            var t = this;
            t.g.selectAll('circle')
                .transition()
                .duration(500)
                .ease('quad-out')
                .attr('cx', function(d) {
                    return t.xScale(t.getValue(d, t.xAxis));
                })
                .attr('cy', function(d) {
                    return t.yScale(t.getValue(d, t.yAxis));
                })
                .attr('r', t.getRadius);
        },

        /**
         * Get the value of a property
         *
         * @param d
         * @param property
         *
         * @returns {number}
         */
        getValue: function(d, property) {
            var r = isNaN(d[property]) ? 0 : d[property];
            if (graph.bDependencies === true) {
                $.each(d.depends, function(key, value) {
                    r += (typeof window.graphData[value] === 'undefined' || isNaN(window.graphData[value][property])) ? 0 : window.graphData[value][property];
                });
            }

            return r;
        },

        /**
         * Defines a sort order so that the smallest dots are drawn on top.
         *
         * @param {Object} a
         * @param {Object} b
         *
         * @return int
         */
        order: function (a, b) {
            return (graph.getRadius(b) - graph.getRadius(a));
        },

        /**
         * Get the radius of a project-circle
         *
         * @param {Object} d
         *
         * @return int
         */
        getRadius: function (d) {
            var r = graph.getValue(d, graph.radius);
            return (!!r) ? (5 + (3 * (6 - d[graph.radius]))) : 0;
        },

        /**
         * If val is negative, return zero
         *
         * @param value
         *
         * @returns {*}
         */
        noNeg: function(value){
            return value = value > 0 ? value : 0;
        },

        /**
         * Find min and maxes (for the scales)
         */
        getBounds: function (d, paddingFactor) {
            paddingFactor = typeof paddingFactor !== 'undefined' ? paddingFactor : 1;

            var keys = _.keys(_.first(_.toArray(d))), b = {};
            _.each(keys, function(k) {
                b[k] = {
                    min: (_.min(d, k))[k],
                    max: (_.max(d, k))[k],
                    avg: (_.reduce(_.pluck(d, k), function(result, value) {
                        return result + value;
                    }) / _.size(d)),
                    unique: _.sortBy(_.uniq(_.map(d, function(t) {
                        return t[k];
                    })))
                };

                b[k].max > 0 ? b[k].max *= paddingFactor : b[k].max /= paddingFactor;
                b[k].min > 0 ? b[k].min /= paddingFactor : b[k].min *= paddingFactor;
            });

            return b;
        },

        /**
         * Render the x-axis
         *
         * @param s
         */
        xAxisRender: function (s) {
            s.call(d3.svg.axis().scale(graph.xScale).orient("bottom"));
        },

        /**
         * Render the y-axis
         *
         * @param s
         */
        yAxisRender: function(s) {
            s.call(d3.svg.axis().scale(graph.yScale).orient("left"))
        },

        /**
         * Zoom/Pan behaviour
         */
        zoom: function() {
            var $canvas = $('#project-canvas');
            if ($canvas.data('zoom') === 'true') {
                $canvas.data('zoom', 'false');
                graph.drawScatterPlot();
            }
            else {
                $canvas.data('zoom', 'true');

                graph.g.select("#xAxis").call(graph.xAxisRender);
                graph.g.select("#yAxis").call(graph.yAxisRender);

                graph.g.select(".hAxisLine").attr("transform", "translate(0," + graph.yScale(0) + ")");
                graph.g.select(".vAxisLine").attr("transform", "translate(" + graph.xScale(0) + ",0)");

                var yVal = graph.yScale(graph.bounds[graph.yAxis].avg),
                    xVal = graph.xScale(graph.bounds[graph.xAxis].avg);

                graph.g.select(".hMedianLine").attr("transform", "translate(0," + yVal + ")");
                graph.g.select(".vMedianLine").attr("transform", "translate(" + xVal + ",0)");

                graph.g.selectAll("circle")
                    .attr("transform", function(d) {
                        return "translate(" + graph.xScale(d[graph.xAxis]) + "," + graph.yScale(d[graph.yAxis]) + ")";
                    });
            }
        },

        /**
         * Create sidebar filter
         */
        buildSelect: function () {
            var t = this,
                $l = $('#sidebar-list'),
                $s;
            $.each(t.filter, function(key, value) {
                if (typeof t.bounds[key] !== 'undefined') {
                    $s = $('<select/>', {
                        class: 'input-medium graph-filter',
                        'data-filter': key,
                        'data-compare': value
                    }).on('change', function() {
                        t.drawScatterPlot();
                    });

                    $s.append($('<option >', {
                        text: key,
                        value: '',
                        selected: 'selected'
                    }));
                    $.each(t.bounds[key].unique, function(k, v) {
                        $s.append($('<option >', {
                            text: v,
                            value: v
                        }));
                    });

                    $l.append($s);
                }
            });

            $l.append('<label class="checkbox"><input id="include-deps" type="checkbox" value="">include dependencies</label>');
            $('#include-deps').change(function() {
                t.bDependencies = $(this).is(':checked');
                t.updateScatterPlot();
            });
        },

        /**
         *
         * @param data
         * @returns {*}
         */
        filterData: function (data) {
            $('select.graph-filter').each(function() {
                var $t = $(this),
                    selection = $t.find('option:selected').val(),
                    property = $t.data('filter'),
                    compare = $t.data('compare');

                if (selection !== '') {
                    var b = {};
                    $.each(data, function(key, value) {
                        if (compare === 'eq' && value[property] == selection) {
                            b[key] = value;
                        }
                        else if (compare === 'min' && parseFloat(value[property]) >= parseFloat(selection)) {
                            b[key] = value;
                        }
                        else if (compare === 'max' && parseFloat(value[property]) <= parseFloat(selection)) {
                            b[key] = value;
                        }
                    });

                    data = b;
                }
            });

            return data;
        }
    }
}(jQuery));