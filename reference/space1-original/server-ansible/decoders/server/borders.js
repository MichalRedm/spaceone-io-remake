var Borders = function(reader)
{
    this.type = 'borders';
    this.minX = reader.nextDouble();
    this.minY = reader.nextDouble();
    this.maxX = reader.nextDouble();
    this.maxY = reader.nextDouble();

    if (reader.position == reader.length)
        return;

    this.deadMinX = reader.nextDouble();
    this.deadMinY = reader.nextDouble();
    this.deadMaxX = reader.nextDouble();
    this.deadMaxY = reader.nextDouble();
}

module.exports = Borders;