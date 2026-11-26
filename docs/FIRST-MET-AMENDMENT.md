# First met VCF import

This amendment updates the [Card2VCF export requirements](../card2vcf/SPEC.md#export) and [Monica import requirements](MONICA-SPEC.md).

Both export modes write the nonempty date, occasion, location and notes as individual text properties named `X-C2V-FIRST-MET-<FIELD>` and keep the readable NOTE fallback. Open VCF restores these properties to the First met editor. Both importers also recognize the ordered First met lines at the end of older Card2VCF notes.

Monica imports a valid date into the introduction date, a location of up to 255 characters into the introduction location, and the occasion and notes into the introduction’s additional information. The full contact note remains available. Existing contacts can receive these values by reimporting their original VCF with Replace.
