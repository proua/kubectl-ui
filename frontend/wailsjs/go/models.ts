export namespace main {
	
	export class CommandResult {
	    command: string;
	    stdout: string;
	    stderr: string;
	    exitCode: number;
	    durationMs: number;
	    parsedData?: any;
	
	    static createFrom(source: any = {}) {
	        return new CommandResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.command = source["command"];
	        this.stdout = source["stdout"];
	        this.stderr = source["stderr"];
	        this.exitCode = source["exitCode"];
	        this.durationMs = source["durationMs"];
	        this.parsedData = source["parsedData"];
	    }
	}

}

